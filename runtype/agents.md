# Mise — Runtype agents, flows & tools

Specs for the Runtype resources. Each maps 1:1 to something you create in Runtype
(Flow, Agent, Tool, or Surface). Once the Runtype MCP tools are live in the session
(restart Claude Code after `claude mcp add`), these become the source for creating them.

- **Flows** = deterministic multi-step pipelines (forecast, planning, promotion sweep).
- **Agents** = LLM-in-a-loop with tools (rebalance, procurement, concierge).
- **Tools** = InsForge reads/writes, exposed to agents/flows.
- **Surfaces** = where each is deployed (owner web/Slack, consumer web/SMS).

Model default: `claude-sonnet-5` for flows and the concierge; `claude-opus-4-8` for the
coordinator/procurement reasoning where multi-constraint trade-offs matter.

---

## Tools (shared)

Back these with InsForge — either the `@insforge/sdk` from a Runtype custom tool, or
InsForge edge functions exposed as HTTP tools.

| Tool | Input | Output | Backing |
|------|-------|--------|---------|
| `get_sales_history` | branch_id, menu_item_id, days | rows of (date, qty) | `select` on `sales` |
| `write_forecast` | branch_id, menu_item_id, period, predicted_qty, confidence | ok | `insert` into `forecasts` |
| `get_recipe_bom` | menu_item_id | ingredient qtys/serving | `menu_item_ingredients` |
| `get_inventory` | branch_id | rows (product, on_hand, par, reorder, expiry) | `inventory` |
| `set_par_levels` | branch_id, [{product_id, par, reorder}] | ok | `update` `inventory` |
| `post_shortage` / `post_surplus` | branch_id, product_id, qty, needed_by | ok | Cotal `#rebalance` + row |
| `propose_transfer` | from, to, product_id, qty, reason | transfer_id | `rebalance_transfers` |
| `open_rfq` | product_id, qty, needed_by | rfq_id | `rfqs` |
| `submit_bid` | rfq_id, supplier_id, unit_price, eta_days | bid_id | `bids` |
| `create_po` | supplier_id, branch_id, product_id, qty, unit_price | po_id | `purchase_orders` |
| `create_promotion` | branch_id, menu_item_id, kind, discount_pct, headline, reason, ends_at | promo_id | `promotions` |
| `get_availability` | branch_id, menu_item_id? | in_stock_now, confidence | `menu_item_availability` view |
| `get_favorites` | consumer_id | menu_item_ids | `favorites` |

---

## Flow: `forecast` (per branch, goal 1)

**Trigger:** weekly cron (and on-demand from the dashboard).
**Steps:**
1. For each menu item, `get_sales_history(branch, item, 60)`.
2. Model step (`claude-sonnet-5`): given the daily series, predict next 7 days'
   servings. Account for day-of-week (weekend lift) and trend. Return `predicted_qty`
   and a `confidence` 0–1.
3. `write_forecast(...)` per item.

**System prompt (step 2):**
> You are a demand forecaster for one restaurant branch. Given ~60 days of daily sales
> for a menu item, forecast total servings for the next 7 days. Weekends (Fri–Sun) run
> higher; detect any trend. Output strict JSON `{predicted_qty:int, confidence:0..1}`.
> Confidence is high when the series is stable, low when volatile or sparse.

---

## Flow: `inventory-planner` (per branch, goal 1)

**Trigger:** after `forecast` completes.
**Steps:**
1. Load forecasts for the branch + `get_recipe_bom` for each item.
2. **Explode** demand → ingredient requirement = Σ(predicted_qty × qty_per_serving).
3. Set `par_level` = requirement × safety factor (1.15); `reorder_point` = requirement
   for the branch's supplier lead time. `set_par_levels(...)`.
4. Compare on-hand vs. par: below reorder → `post_shortage`; above par (esp. near
   expiry) → `post_surplus`. This is what lights up the Cotal `#rebalance` channel.

No LLM needed — pure deterministic math. Keep it a Flow so it's fast and reproducible.

---

## Agent: `rebalance-coordinator` (franchise, goal 1) — the showpiece

**Surface:** owner dashboard + Slack (posts the transfer/PO approval card).
**Tools:** `propose_transfer`, `create_po` (via procurement handoff), Cotal read/post.
**Loop:** watch `#rebalance`; match surplus↔shortage per product (nearest branch,
nearest expiry first); `propose_transfer`; sum unmet shortage and hand to `procurement`.

**System prompt:**
> You coordinate stock across branches of one franchise. Given posted shortages and
> surpluses per ingredient, produce the cheapest waste-minimizing plan: cover shortages
> with transfers from branches holding surplus (prefer nearest branch and nearest-expiry
> lots) before buying anything. For each transfer call `propose_transfer` with a one-line
> rationale. Whatever shortage remains, request from procurement. Summarize the plan as an
> approval card: transfers first, then purchases, with the waste avoided and cost.

---

## Agent: `procurement` (franchise, goal 1)

**Surface:** owner Slack (approval).
**Tools:** `open_rfq`, `create_po`; reads `bids`.
**Loop:** for each net shortage → `open_rfq`; suppliers bid (supplier agents / sim);
pick lowest landed cost meeting `needed_by`; `create_po(status=pending)` for approval.

**System prompt:**
> You buy ingredients for a restaurant franchise at least cost. For a shortage, open an
> RFQ, gather supplier bids, and choose the lowest landed cost (unit_price×qty) that
> arrives by needed_by, honoring min-order quantities. Create a pending purchase order and
> explain the choice in one line.

---

## Flow: `promotion-sweep` (per branch, goal 2)

**Trigger:** weekly cron (Monday), after planning.
**Steps:**
1. `get_inventory(branch)` → find products with on_hand well above par OR earliest_expiry
   within shelf-life window AND no rebalance transfer claimed them.
2. Map each such product → menu items that use it (BOM), weight by menu popularity.
3. Model step: craft a promotion (kind, discount %, headline) that moves the surplus.
4. `create_promotion(...)`; it surfaces on the consumer app and Cotal `#promotions`.

**System prompt (step 3):**
> You are a restaurant marketer. Given an ingredient in surplus or near expiry and the
> menu items that use it, design one promotion to sell it through before it spoils: pick a
> menu item (favor popular ones), a discount 10–25% or a bundle, and a punchy one-line
> headline. Output JSON `{menu_item_id, kind, discount_pct, headline, reason}`.

Example output: *"Pesto Night — 20% off Pesto Penne while the basil is fresh."*

---

## Agent: `consumer-concierge` (consumer, goal 3)

**Surface:** consumer web chat + SMS.
**Tools:** `get_availability`, `get_favorites`, read `menu_items`, `promotions`.
**Behavior:** answer "is X available at branch Y tonight?" from `menu_item_availability`
(current stock + forecast confidence); recommend in-stock dishes and active promotions;
for a signed-in consumer, lead with their favorites.

**System prompt:**
> You are a friendly restaurant concierge. Tell diners honestly whether a dish is
> available now and how likely it stays available (use in_stock_now + forecast
> confidence: >0.7 "reliably available", 0.4–0.7 "usually available", else "call ahead").
> Lead with the diner's favorites when known, suggest in-stock alternatives if something's
> out, and mention any active promotion. Never promise a dish the data says is unavailable.

---

## Surfaces summary

| Surface | Serves | Resources deployed |
|---------|--------|--------------------|
| Web dashboard | Owner | forecast/planner results, rebalance + PO approval cards, live inventory |
| Slack | Owner | approval cards from coordinator + procurement |
| Web chat / SMS | Consumer | concierge |

## Build order (once Runtype tools are live)

1. Create the InsForge-backed **Tools** first (everything depends on them).
2. `forecast` + `inventory-planner` Flows → verify they write forecasts/par levels.
3. `rebalance-coordinator` + `procurement` Agents → wire to Cotal `#rebalance`/`#procurement`.
4. `promotion-sweep` Flow, then `consumer-concierge` Agent.
5. Attach surfaces; deploy.
