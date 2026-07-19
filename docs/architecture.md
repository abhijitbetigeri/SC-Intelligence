# Mise — Intelligence Supply Chain for Restaurants

> *"Mise en place"* — everything in its place, ready before service. The product keeps the
> right ingredients in the right branch at the right time, driven by real customer demand.

AGI Summit 2026 Hackathon · Vertical AI + Multi-Agent System

This is the **as-built** architecture. For exhaustive resource IDs and run commands see
[../runtype/BUILD.md](../runtype/BUILD.md) (Runtype), [../INSFORGE.md](../INSFORGE.md) (backend),
and [cotal-mesh.md](cotal-mesh.md) (the mesh + demo script).

---

## The problem

Restaurant inventory is a distributed system with no shared state. Every branch orders in
isolation, so a franchise over-orders at one location (waste, spoilage, cash tied up) while
stocking out at another. The obvious fix — move surplus between branches before buying new — never
happens, because there is no coordination layer and no central planner that scales.

## The idea

An **intelligence layer across the supply chain** — supplier → franchise → branch → consumer —
where each branch and supplier is an autonomous agent: forecast demand per menu item, keep each
branch stocked to that demand, **rebalance surplus between branches before buying**, auto-trigger
promotions to burn down surplus, and give consumers **predictable availability**.

## Three goals

1. **Demand-driven supply chain + franchise rebalancing** (the multi-agent showpiece) — forecast
   per item per branch → derive ingredient needs → rebalance across branches → procure only the net.
2. **Autonomous promotions** — surplus / near-expiry stock triggers a menu promotion before spoilage.
3. **Consumer predictability** — favorites and popular items stay in stock; the concierge can tell
   a diner live/predicted availability.

---

## Architecture — three layers

> **Slide-ready diagram:** [architecture-diagram.html](architecture-diagram.html) (open in a
> browser, screenshot for a deck). The ASCII version below says the same thing in text.

```
                    CONSUMERS                              OWNERS / BRANCH ADMINS
                        │                                          │
        ┌───────────────┴──────────────────────────────────────────┴───────────────┐
  UI    │   Landing   ·   Mesh Console   ·   Branch Operations   ·   Market Intel     │  (hosted on InsForge)
        └───────────────┬──────────────────────────────────────────┬───────────────┘
                        │  Persona chat widget (owner & consumer)   │
   ┌────────────────────────────────────────────────────────────────────────────────┐
   │  COTAL — COORDINATION                                                            │
   │  branch + supplier nodes negotiate over channels; anycast on #rebalance          │
   │  #demand → #rebalance → #procurement → #promotions → #decisions                   │
   └────────────────────┬───────────────────────────────────────────────────────────┘
                        │  a node, when it must DECIDE, calls capabilities via the MCP bridge ↓
   ┌────────────────────┴───────────────────────────────────────────────────────────┐
   │  RUNTYPE — REASONING  (6 capabilities, agents + flows, exposed over an MCP surface)│
   │  weekly_forecast · rebalance_and_procure (opus) · promotion_sweep ·               │
   │  consumer_concierge · inventory_admin · menu_intelligence                         │
   └────────────────────┬───────────────────────────────────────────────────────────┘
                        │  reads / writes state ↓
   ┌────────────────────┴───────────────────────────────────────────────────────────┐
   │  INSFORGE — STATE + HOSTING  (Postgres)                                          │
   │  inventory · rebalance_transfers · rfqs · bids · purchase_orders · forecasts ·    │
   │  promotions · mi_* market data     +     serves the frontend                     │
   └──────────────────────────────────────────────────────────────────────────────────┘

   Reasoning inside every agent: Anthropic — claude-opus-4-8 (rebalance) / claude-sonnet-5 (rest)
```

| Layer | Tool | Role |
|-------|------|------|
| Coordination | **Cotal** | Branches & suppliers as agent nodes; presence, channels, anycast rebalancing. Decides *who talks to whom and when*. |
| Reasoning | **Runtype** | 6 agent/flow capabilities over an MCP bridge. Decides *what the smart move is*. |
| State + hosting | **InsForge** | Postgres for inventory/transfers/POs/forecasts + the scraped market; hosts the UI. *Remembers.* |
| Conversation | **Persona** | Embedded chat widget behind the owner/consumer assistants. |
| Model | **Anthropic** | `claude-opus-4-8` for the multi-constraint rebalance; `claude-sonnet-5` elsewhere. |

> **State note.** The live agent demo currently reads/writes **Runtype's native record store**
> (`catalog`, `branch-state`, `forecast`, `promotion`, `transfer`, `po`, `consumer`) so it is fully
> self-contained. **InsForge Postgres** is provisioned as the production backend (mirrors
> [../db/schema.sql](../db/schema.sql) + seed), holds the scraped `mi_*` market data, and hosts the
> frontend. To move the demo onto Postgres, re-point the record tools at InsForge-backed tools.

## Capabilities (Runtype, as built)

Product `Mise` (`prod_01kxvr3fcneskr35jfxqhekaj0`), all smoke-tested, with eval suites.

| Capability | Kind / model | What it does | Cotal role |
|------------|--------------|--------------|------------|
| `weekly_forecast` | flow · sonnet-5 | Next-7-day demand per menu item per branch, with confidence | posts to `#demand` |
| `rebalance_and_procure` ⭐ | agent · **opus-4-8** | Match surplus↔shortage across branches (nearest branch, nearest expiry), then least-cost PO for the net | owns `#rebalance` / `#procurement` |
| `promotion_sweep` | flow · sonnet-5 | Surplus / near-expiry → a menu promotion that clears it fastest | posts `#promotions` |
| `consumer_concierge` | agent · sonnet-5 | "Is my dish available tonight?" from stock × BOM × forecast; leads with favorites | reads availability |
| `inventory_admin` | agent · sonnet-5 | Per-branch stock detail, days-of-cover projection, reorder-to-par | powers the Branch UI |
| `menu_intelligence` | flow · sonnet-5 | Web-scrape a cuisine → restaurants, branches, menus, ingredients | — (market data) |

**Surfaces:** Owner Console, Diner Chat, Branch Admin Console (chat, Persona embeds), and the
**Mesh Bridge (MCP)** surface — the connector a Cotal node adds with `claude mcp add` to call the
four ops capabilities as tools.

## The rebalance loop (the showpiece) — verified

1. Forecast + planner run per branch → **Downtown** is short **36 kg** tomatoes for the weekend
   (par 40, on-hand 4); **Marina** holds ~10 kg surplus nearing expiry.
2. Downtown broadcasts a SHORTAGE on `#rebalance`.
3. **Anycast:** surplus-holders are addressed; Marina claims it (near-expiry, nearest branch) and
   proposes a **10 kg transfer** → coordinator confirms, writes `rebalance_transfers`, posts `#decisions`.
4. Only the **net 26 kg** escalates to `#procurement`. Two supplier agents bid; **Bay Foods wins at
   $2.05/kg** over NorCal's $2.20 → a **$53.30** PO (`status=pending`).
5. Owner approves one clean card. *One shortage in, one decision out: least waste, least cost.*

**Promotion loop:** Mission's near-expiry basil, needed by no branch, becomes **"Pesto Night —
Pesto Penne 20% off"** (the item that clears basil fastest). **Consumer loop:** the concierge tells
a diner the Margherita is available tonight, because the mesh just restocked it.

## Cotal mesh

Manifest [../cotal.yaml](../cotal.yaml), space `trattoria-verde`, nodes run natively as Claude Code:
- **3 branch nodes** (downtown / marina / mission) — declare shortage/surplus, claim transfers.
- **rebalance-coordinator** (lead) — matches surplus↔shortage, confirms transfers, sums net shortage.
- **procurement** — opens RFQs, awards least landed cost.
- **2 supplier nodes** (NorCal, Bay Foods) — bid on RFQs (anycast: one wins).
- Channels: `#demand · #rebalance · #procurement · #promotions · #decisions`.

**Status:** the mesh is the coordination *design* plus a working **MCP connector**; you run it with
`cotal up` / `cotal spawn` on your machine. The **Mesh Console** ([../web/mesh.html](../web/mesh.html))
is a faithful **replay** of the negotiation for a rehearsable stage visual. Full use case + on-stage
script: [cotal-mesh.md](cotal-mesh.md).

## Menu intelligence (market data)

A reusable Runtype flow (`flow_01kxw1z553e8qte3mb253seweh`): **Exa search → select targets →
Firecrawl scrape → LLM extract** → structured restaurants / branches / dishes / ingredients. Run
for 8 cuisines and loaded into InsForge `mi_*` tables (**16 restaurants · 53 branches · 128 dishes**),
with a `mi_ingredient_frequency` view — the cross-cuisine demand signal. Details:
[menu-intelligence.md](menu-intelligence.md). *(Restaurants/branches/dishes are real from live
search; ingredients are LLM-derived and flagged until the Firecrawl menu-URL fix feeds real menus.)*

## Data model

**Runtype records (live demo):** `catalog/trattoria-verde` (branches, products, menu+BOM, suppliers),
`branch-state/{downtown,marina,mission}` (inventory + sales), `forecast/latest`, `promotion/latest`,
`transfer/*`, `po/*`, `consumer/alex`.

**InsForge Postgres (production backend):** the franchise schema — `franchises, branches, products,
suppliers, supplier_products, menu_items, menu_item_ingredients, inventory, sales, forecasts,
rebalance_transfers, rfqs, bids, purchase_orders, promotions, consumers, favorites` + the
`menu_item_availability` view; and the market schema — `mi_cuisines, mi_restaurants, mi_branches,
mi_dishes, mi_dish_ingredients` + `mi_ingredient_frequency`.

## The UI (three views → three layers)

Hosted at **https://k3trn3a2.insforge.site** (light + dark).

| View | Layer it shows | For the demo |
|------|----------------|--------------|
| **Mesh Console** `/mesh.html` | Cotal coordination | Run the rebalance cycle; watch the agents negotiate to one approval |
| **Branch Operations** `/branch.html` | Runtype + InsForge (operator view) | Stock, days-of-cover, reorder plan + a live Persona AI assistant |
| **Market Intelligence** `/market.html` | menu_intelligence + InsForge | 8 cuisines; the cross-cuisine ingredient-demand bars |

## What's live vs. designed (be precise on stage)

| Piece | Status |
|-------|--------|
| Runtype agents/flows (all 6) | **Live + verified** — the $53.30 plan is real agent output |
| MCP bridge (Cotal → Runtype connector) | **Live** (surface ready, key minted) |
| InsForge (schema, seed, market data, hosting) | **Live** |
| Persona chat (Branch Ops) | **Live** (real Runtype agent) |
| Cotal mesh (nodes negotiating over channels) | **Designed + connector live**; Mesh Console is a faithful replay |

Framing that stays true: *"each branch and supplier is modeled as an autonomous agent on a Cotal
mesh; the reasoning runs as live Runtype agents, and the console replays the negotiation."*
