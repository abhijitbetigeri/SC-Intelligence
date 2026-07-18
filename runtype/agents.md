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
| `get_availability` | branch_id, menu_item_id? | in_stock_now, **servings_available**, confidence | `menu_item_availability` view |
| `get_stock_signal` | branch_id | rows (product, on_hand, daily_burn, days_of_cover, days_to_expiry, spoil_qty, transferable_qty, needed_by, status) | `v_replenishment_signal` ([../db/views.sql](../db/views.sql)) |
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
   over the lead time of the **fastest supplier carrying that product**, plus a 2-day
   buffer. (Note: "the branch's supplier lead time" isn't defined — `lead_time_days`
   lives on `suppliers`, and a branch has no supplier relation.) Shape the requirement
   across the **specific days** in that window rather than a flat 7-day average: the seed
   puts a 1.6× lift on Fri–Sun, so a flat average under-orders ~27% going into a weekend
   and over-orders ~26% going into a slow week — and on a 6-day tomato shelf life the
   over-order becomes the waste that goal 2 then has to clean up. `set_par_levels(...)`.
4. Read `get_stock_signal(branch)` and act on **days of cover**, not just the reorder
   point: `days_of_cover <= 1` → `post_shortage` with `needed_by` from the view; a
   positive `spoil_qty` → `post_surplus` for `transferable_qty`. This is what lights up
   the Cotal `#rebalance` channel.

   Why cover and not the reorder point alone: on the current seed Downtown's basil holds
   1.2 kg against a reorder point of 0.6, so nothing fires — but it burns 1.36 kg/day,
   i.e. **0.88 days of cover** against a 1-day minimum lead time. It runs out mid-service
   and no agent notices. A hand-authored reorder point that doesn't reflect consumption
   will always have this blind spot.

   And offer `transferable_qty`, not "everything above par": Marina holds 34 kg of
   tomatoes expiring in 2 days against a 10.1 kg/day burn. Above-par gives 10 kg, but
   **13.8 kg will spoil regardless** — so 13.8 kg is the honest offer. It cuts waste and
   shrinks the PO Downtown still needs.

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
**Loop:** for each net shortage → `open_rfq` (with `needed_by` from `get_stock_signal`, not
NULL); suppliers bid; **rank the bids deterministically** with
[`src/mise/supplier_rank.py`](../src/mise/supplier_rank.py); `create_po(status=pending)`
for approval.

> **Why the ranking moved out of the prompt.** The old rule — "lowest landed cost that
> arrives by `needed_by`" — has a hole: `rfqs.needed_by` is nullable and nothing computed
> it, so the deadline term was absent and the rule collapsed to *lowest unit price*. The
> as-built coordinator shows it: `BUILD.md` records `buy 26 TOM-ROMA from Bay Foods @ $2.05
> = $53.30`. Bay Foods is $0.15/kg cheaper and a day slower; Downtown had 4.0 kg against a
> 14.2 kg/day burn — **6.7 hours of cover**. The order saved $3.90 and landed ~1.7 days
> after the shelf emptied, and the card reported success.
>
> Constrained optimisation is also the wrong job for the model. Compute the ranking, hand
> the agent the **already-ranked** list with `feasible` and a `note` per option, and let it
> do what it's good at: writing the sentence.

**System prompt:**
> You buy ingredients for a restaurant franchise. You will be given supplier options
> **already ranked**, each with `feasible` (can it arrive before the branch runs out) and a
> `note` explaining any option that cannot. Take the top-ranked option — do not re-rank on
> price. Honor min-order quantities. Create a pending purchase order and explain the choice
> in one line, naming the runner-up by *why it actually lost*: say "cheaper but arrives
> after we run dry", never "cheaper" about a more expensive option.
>
> If the top option is not `feasible`, **no supplier can beat the stockout**. Say so
> plainly on the card — "this order lands N days after we run out; plan a substitute" —
> rather than presenting the PO as if it closed the loop. Recommending a substitute dish or
> a transfer is more useful than a confident purchase order over an empty shelf.

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
> Check `servings_available`, not just `in_stock_now` — one serving's worth of an
> ingredient counts as "in stock" but will not survive service. If `servings_available` is
> below the forecast for tonight, say "available now, but running low" rather than
> promising it.
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
