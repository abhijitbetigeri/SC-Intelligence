# Mise — Intelligence Supply Chain for Restaurants

> *"Mise en place"* — everything in its place, ready before service. The product keeps the
> right ingredients in the right branch at the right time, driven by real customer demand.

AGI Summit 2026 Hackathon · Vertical AI + Multi-Agent System

---

## The problem

Restaurants run on guesswork. Owners over-order (waste, spoilage, cash tied up) or
under-order (stockouts of the exact dishes customers came for). Franchises make it worse:
one branch dumps surplus tomatoes while another two miles away 86's the marinara.

## The idea

An **intelligence layer across the supply chain** — supplier → franchise → branch → consumer —
where specialist agents forecast demand per menu item, keep each branch stocked to that demand,
**rebalance surplus between branches of the same franchise**, auto-trigger promotions to burn
down surplus, and give consumers **predictable availability** of the dishes they love.

## Three goals (from the product owner)

1. **Demand-driven supply chain + franchise rebalancing.** Forecast customer demand per menu
   item per branch → derive ingredient needs → procure to demand. For franchise-owned groups,
   coordinate *across branches* to distribute and rebalance stock before buying more.
   Dashboard surfaces waste risk and guarantees top-selling items stay covered.
2. **Autonomous promotion trigger.** Weekly, an agent inspects inventory vs. movement. Surplus
   or slow-moving stock → it triggers a promotion/marketing action for that menu item to sell
   through before spoilage.
3. **Consumer predictability.** Diners get a better experience because their favorite / the
   most-popular items are reliably in stock — the system prioritizes keeping them available and
   can tell a consumer the live/predicted availability of what they like.

---

## Architecture

```
                          ┌─────────────────────── COTAL MESH (one Space per franchise) ───────────────────────┐
                          │                                                                                     │
  Suppliers  ◀──RFQ────►  │  #procurement        #rebalance            #demand            #promotions           │
   (agents)               │       ▲                  ▲                    ▲                     ▲                │
                          │       │        ┌─────────┴─────────┐         │                     │                │
                          │  Procurement   │  Branch A   Branch B  Branch C  (agent nodes,     │                │
                          │    Agent       │  presence + surplus/shortage, anycast rebalance)  │                │
                          │                └───────────────────────────────────────────────────┘               │
                          └─────────────────────────────────────────────────────────────────────────────────────┘
        RUNTYPE (agents/flows + surfaces)                       INSFORGE (backend)
        ├─ Forecast Agent      → owner dashboard (web)          ├─ Postgres: inventory, sales, forecasts, ...
        ├─ Inventory Planner   → owner Slack (approvals)        ├─ Auth: owner vs consumer (RLS)
        ├─ Rebalance Coord.    → consumer web chat / SMS        ├─ Realtime: live inventory + rebalance feed
        ├─ Procurement Agent                                    ├─ pgvector: dish/ingredient/supplier matching
        ├─ Promotion Agent                                      └─ (Stripe optional: consumer orders)
        └─ Consumer Concierge
```

### Layer responsibilities

| Layer | Tool | Role |
|-------|------|------|
| Coordination mesh | **Cotal.ai** | Branches + suppliers are agent nodes; presence, channels, anycast bidding/rebalancing |
| Agent runtime + surfaces | **Runtype** | Agents & flows built once, deployed to owner dashboard/Slack + consumer chat/SMS |
| Backend / state | **InsForge** | Postgres, auth+RLS, realtime, pgvector, (Stripe) |
| Reasoning | **Anthropic** | Model brains inside each agent |

---

## Agents

| Agent | Scope | What it does | Cotal role | Runtype form |
|-------|-------|--------------|------------|--------------|
| **Forecast** | per branch | Predicts next-period demand per menu item from sales history + signals (day-of-week, weather, events) | posts to `#demand` | Flow |
| **Inventory Planner** | per branch | Explodes forecast → ingredient needs (recipe BOM); computes par levels, reorder points, surplus | writes needs/surplus | Flow |
| **Branch** | per branch | Represents the branch live in the mesh; declares surplus/shortage, claims rebalance offers | agent node (presence, tags=location) | Agent |
| **Rebalance Coordinator** | franchise | Matches surplus ↔ shortage across branches before any external buy | anycast on `#rebalance` | Agent |
| **Procurement** | franchise | For net shortage, broadcasts RFQ; supplier agents bid; assembles PO for owner approval | multicast `#procurement` | Agent |
| **Promotion** | per branch | Weekly: surplus / near-expiry / slow-movers → triggers a promotion for that menu item | posts `#promotions` | Flow |
| **Consumer Concierge** | consumer | Answers "is my favorite available tonight?", recommends in-stock dishes, surfaces specials | reads availability | Agent |
| **Supplier** (sim) | external | Subscribes to RFQs, bids on what it can fulfill (anycast: one claims) | agent node | Agent |

### The rebalance loop (the showpiece)

1. Forecast + Planner run per branch → Branch A predicts a **shortage** of 15 kg tomatoes for the
   weekend; Branch B is sitting on a **surplus** of 20 kg nearing expiry.
2. Branch A broadcasts its need on `#rebalance`.
3. **Anycast**: branches holding surplus tomatoes are addressed; Branch B claims it, proposes a transfer.
4. Rebalance Coordinator confirms the transfer (cheaper + kills waste vs. buying new).
5. Only the *net* franchise shortage escalates to Procurement → supplier RFQ.
6. Owner sees one clean approval: *"Transfer 15 kg tomatoes B→A, buy 5 kg from Supplier X. Approve?"*

This is a live, on-stage, **agents-talking-to-agents** moment — hard to fake, easy to feel.

### The promotion loop (goal 2)

Weekly cron → Promotion Agent scans inventory: item with surplus/near-expiry stock **and** the
menu items that depend on it → generates a promotion (discount %, bundle, or "chef's special"),
writes it to `promotions`, and pushes it to the consumer surface. Surplus becomes revenue instead
of waste.

### The consumer loop (goal 3)

Consumer favorites are first-class. Concierge answers availability from **current stock +
forecast confidence**, so a diner hears *"Your Margherita is in stock now and predicted available
all weekend"* — and the supply chain is already working to keep it that way.

---

## 2-day MVP scope

**Build (spine):** InsForge schema + seed → Forecast + Planner flows → Cotal mesh with 3 Branch
agents + Rebalance Coordinator → the rebalance loop with owner approval → owner dashboard showing
live inventory, forecasts, the rebalance/PO proposal.

**Layer if time:** Promotion agent + consumer availability chat; supplier RFQ bidding; pgvector
matching.

**Cut for demo:** real supplier APIs (simulate with agents), payments, mobile, auth polish.

## Demo script (5 min)

1. Dashboard: 3 branches of "Trattoria" franchise, live inventory, forecasts for the weekend.
2. Trigger the weekly run. Watch the Cotal console: branches post demand, A flags a tomato
   shortage, B offers surplus, anycast match, coordinator confirms transfer.
3. Net shortage escalates → supplier bids → owner gets a single approval in Slack. Approve.
4. Promotion agent spots surplus basil at Branch C → auto-creates a "Pesto Night" special;
   it appears on the consumer app.
5. Consumer asks the Concierge "is the Margherita available tonight at Branch A?" → confident yes,
   *because the mesh just restocked it.*

---

## Repo layout

```
docs/architecture.md      ← this file
db/schema.sql             ← InsForge Postgres schema
db/seed.sql               ← demo franchise, branches, menu, BOM, sales history
cotal.yaml                ← mesh manifest: branch + supplier agent nodes, channels
runtype/agents.md         ← agent + flow specs (system prompts, tools, flow steps) → Runtype resources
src/                      ← Python helpers (Anthropic) if needed
```
