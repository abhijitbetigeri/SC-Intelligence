# Mise — Intelligence Supply Chain for Restaurants

> 🏆 **Winner — AGI Summit 2026 Hackathon** · *Agent Mesh for Zero Waste*

**AGI Summit 2026.** A multi-agent system that keeps the right ingredients in the right
branch at the right time, driven by real customer demand. Owners get an autonomous back-of-house
supply chain (demand forecasting, cross-branch rebalancing, procurement, surplus-driven
promotions); consumers get predictable availability of the dishes they love.

> *"mise en place" — everything in its place, ready before service.*

**Why "Mise"?** *Mise en place* (French, "putting in place") is the discipline every professional
kitchen runs on: before service, a cook preps and arranges every ingredient so that when orders
fire, nothing is missing and nothing slows the line. Mise does the same for the supply chain — it
keeps the right ingredients in the right branch at the right time, ready before demand hits.

📖 **The story:** [Agent Mesh for Zero Waste — how we built it and won](docs/blog.md).

## ▶ Live demo

**https://k3trn3a2.insforge.site** (hosted on InsForge, light + dark mode)
· 🎥 **[Demo video (Loom)](https://www.loom.com/share/dce11fa6016a4cd691abf6bc8b21828d)**

| View | What it shows |
|------|---------------|
| [Landing](https://k3trn3a2.insforge.site/) | The story and the three views |
| [Mesh Console](https://k3trn3a2.insforge.site/mesh.html) | Branch & supplier agents negotiating a tomato shortage in real time (Cotal) |
| [Branch Operations](https://k3trn3a2.insforge.site/branch.html) | A branch admin's inventory console + live AI assistant (Persona) |
| [Market Intelligence](https://k3trn3a2.insforge.site/market.html) | 8 cuisines scraped from the web: restaurants, menus, ingredient demand |

## Project description

**The problem.** Restaurant inventory is a distributed system with no shared state. Every branch
orders in isolation, so a franchise over-orders at one location (waste, spoilage, cash tied up)
while stocking out at another. The obvious fix — move surplus between branches before buying new —
never happens, because there is no coordination layer and no central planner that scales across
locations and suppliers.

**Target user.** Restaurant operators: branch admins and franchise procurement managers who run
back-of-house inventory and purchasing. Diners benefit downstream through reliable availability of
the dishes they order.

**What we built.** Mise models each branch and supplier as an autonomous agent on a coordination
mesh. Each cycle, branch agents forecast demand, explode it through recipe bills-of-materials into
ingredient requirements, and derive par/reorder levels and days-of-cover. Shortages and surpluses
post to a shared `#rebalance` channel; **anycast** routes a shortage to surplus-holders, which
claim it (nearest branch, nearest-expiry lot first) and propose a transfer. A coordinator confirms
transfers, and only the *net* franchise shortage escalates to a procurement RFQ where supplier
agents bid — the lowest landed-cost bid becomes a single owner-approval purchase order. Surplus
near expiry is auto-converted into promotions, and a consumer concierge answers "is my dish
available tonight?" from live stock × forecast. It ships as a hosted product with three views: a
Mesh Console (the agents negotiating), a Branch Operations dashboard (Persona-embedded assistant),
and Market Intelligence.

**Technical approach.** Three layers, each doing what it's best at. **Cotal** handles coordination
— agent nodes, presence, and anycast over channels (`#demand / #rebalance / #procurement /
#decisions`), no central planner. **Runtype** handles reasoning — six capabilities (agents + flows;
`claude-opus-4-8` for the multi-constraint rebalance/procurement, `claude-sonnet-5` elsewhere)
exposed over an **MCP bridge** that mesh nodes call as tools, hardened with eval suites. **InsForge**
(Postgres) holds shared state — inventory, transfers, RFQs, bids, POs, forecasts — and hosts the
frontend.

**Worked example (live).** Heading into the weekend, the Downtown branch is 36 kg short on
tomatoes. Rather than buy all of it, the coordinator first covers the gap from within the
franchise: Marina is holding near-expiry surplus, so 10 kg moves branch-to-branch (zero cost,
spoilage avoided). Only the 26 kg net shortage escalates to procurement, where two supplier agents
bid — Bay Foods wins at $2.05/kg over NorCal's $2.20 — landing a single **$53.30** purchase order
for the owner to approve. One shortage in, one decision out: least waste, least cost. Separately, a
menu-intelligence flow (Exa search → Firecrawl scrape → LLM extraction) ingested **8 cuisines, 16
restaurants, and 128 dishes** into the same backend, surfacing a cross-cuisine ingredient-demand
signal for shared procurement.

## The idea

Restaurants run on guesswork: over-order (waste) or under-order (stockouts). Franchises make it
worse — one branch dumps surplus tomatoes while another two miles away 86's the marinara. Mise
puts an **intelligence layer across the supply chain**: supplier → franchise → branch → consumer,
where specialist agents forecast demand per menu item, rebalance surplus **between branches**
before buying, auto-trigger promotions to burn down surplus, and give diners predictable
availability.

**Three goals:** (1) demand-driven supply chain with cross-branch rebalancing (the multi-agent
showpiece); (2) autonomous promotions from surplus / near-expiry stock; (3) consumer predictability.

## Architecture

📐 **[Slide-ready diagram](docs/architecture-diagram.html)** (open in a browser / screenshot for a deck) · full write-up in [docs/architecture.md](docs/architecture.md).

Three layers, each doing what it's best at:

```
   COTAL      coordination — branches & suppliers are agent nodes negotiating stock
              peer-to-peer (anycast on #rebalance); no central planner
      │  each node, when it must decide, calls ↓
   RUNTYPE    reasoning — 6 capabilities (agents + flows) over an MCP bridge
      │  reads / writes ↓
   INSFORGE   state + hosting — Postgres for inventory, transfers, POs, market data;
              serves the UI
```

| Layer | Tool | Role |
|-------|------|------|
| Coordination mesh | **[Cotal.ai](cotal.yaml)** | Branches + suppliers as autonomous agent nodes; presence, channels, anycast rebalancing ([why Cotal + demo script](docs/cotal-mesh.md)) |
| Agent runtime + surfaces | **Runtype** | Agents & flows built once, deployed to chat surfaces + an MCP bridge ([as-built](runtype/BUILD.md)) |
| Backend / state / hosting | **InsForge** | Postgres, provisioned schema + seed + scraped market, and the frontend host ([runbook](INSFORGE.md)) |
| Chat widget | **[Persona](https://github.com/runtypelabs/persona)** | The embedded assistants on the owner/consumer surfaces |
| Reasoning | **Anthropic** | `claude-opus-4-8` (rebalance) and `claude-sonnet-5` inside the agents |

## What's built

**Runtype** — product `Mise` (`prod_01kxvr3fcneskr35jfxqhekaj0`), all smoke-tested, with eval suites.
Backed by Runtype's native record store so the live demo has no external dependency. Full IDs +
run commands in [runtype/BUILD.md](runtype/BUILD.md).

| Capability | Kind | Does |
|------------|------|------|
| `weekly_forecast` | flow | Next-7-day demand per menu item per branch |
| `rebalance_and_procure` ⭐ | agent (opus) | Match surplus↔shortage across branches, then draft the least-cost PO for approval |
| `promotion_sweep` | flow | Turn surplus / near-expiry stock into a menu promotion |
| `consumer_concierge` | agent | Answer "is my dish available tonight?" from live stock + forecast |
| `inventory_admin` | agent | Per-branch stock detail + days-of-cover projections + reorder plans |
| `menu_intelligence` | flow | Web-scrape restaurants → branches → menus → ingredients for a cuisine |

Surfaces: Owner Console, Diner Chat, Branch Admin Console (chat, Persona embeds) and a **Mesh
Bridge (MCP)** surface — the connector Cotal nodes call.

**InsForge** — project `AGISummit` (`k3trn3a2`, us-east), provisioned and verified:
- `db/schema.sql` + `db/seed.sql` — the Trattoria Verde franchise (3 branches, 5 menu items, BOM,
  18 inventory rows, ~900 rows of 60-day sales), rigged so the demo fires on first run.
- `db/market-intel.sql` — the scraped market: **8 cuisines · 16 restaurants · 52 branches · 128
  dishes · 589 ingredients**, plus a `mi_ingredient_frequency` view (cross-cuisine demand signal).
- Hosts the `web/` frontend (Vercel-backed). See [INSFORGE.md](INSFORGE.md).

**Cotal** — the mesh manifest ([cotal.yaml](cotal.yaml)): 3 branch nodes, a rebalance coordinator,
procurement, and 2 supplier bidders, on channels `#demand / #rebalance / #procurement /
#promotions / #decisions`. Nodes run natively as Claude Code and call Mise capabilities over the
MCP bridge; state lives in InsForge. Full use case + on-stage script in
[docs/cotal-mesh.md](docs/cotal-mesh.md).

**UI** ([web/](web/)) — self-contained pages, warm ops-console aesthetic, light + dark:
a landing hub, the Branch Operations dashboard (Persona chat + client-side projections), the Mesh
Console (a replay of the anycast negotiation), and Market Intelligence (the scraped `mi_*` data).

## Repo layout

```
README.md                this file
docs/architecture.md     design, agent topology, demo script
docs/cotal-mesh.md       why Cotal + the on-stage mesh demo
docs/menu-intelligence.md the web-scraper flow, schema, and how to run it
INSFORGE.md              InsForge project context + runbook
runtype/BUILD.md         the as-built Runtype product (IDs, capabilities, MCP bridge, evals)
runtype/agents.md        the original agent/flow specs
cotal.yaml               Cotal mesh manifest (agent nodes + channels)
db/schema.sql            InsForge Postgres schema (demo franchise)
db/seed.sql              Trattoria Verde seed (branches, menu, BOM, 60d sales)
db/market-intel.sql      market-intelligence schema (mi_* tables)
web/                     the hosted UI (landing, branch, mesh, market)
scripts/                 dataset builders + the menu-intel loader
data/menu-intel/         the 8 scraped cuisine datasets (JSON)
provision/               operator SPA + local dev backend (in progress)
```

## Run it

**Backend (InsForge)** — the project is linked; apply the SQL if standing up a fresh instance:
```bash
npx @insforge/cli login          # or: --user-api-key <UAK>
npx @insforge/cli link --project-id 9973a08c-1038-4b56-8c1f-12963bb6954b --org-id <ORG> -y
npx @insforge/cli db import db/schema.sql
npx @insforge/cli db import db/seed.sql
npx @insforge/cli db import db/market-intel.sql
```

**Runtype agents** — already built (rebuild from [runtype/BUILD.md](runtype/BUILD.md) via the
Runtype MCP). Cotal nodes connect the Mise capabilities as tools:
```bash
claude mcp add --transport http mise \
  https://api.runtype.com/v1/products/prod_01kxvr3fcneskr35jfxqhekaj0/surfaces/surf_01kxvzxg98fqb8x1ngbe2a38q4/mcp \
  --header "Authorization: Bearer $MISE_MCP_KEY"
```

**Cotal mesh** ([cotal.yaml](cotal.yaml)):
```bash
npx cotal-ai setup && cotal up --detach
cotal spawn rebalance-coordinator   # then each branch + supplier node, per terminal
cotal web                           # live activity
```

**UI** — use the hosted URL, or serve locally (the Persona chat and the Market page need a real
HTTP origin):
```bash
cd web && python3 -m http.server 8080   # http://localhost:8080/
# redeploy: npx @insforge/cli deployments deploy web
```

## The demo (≈5 min)

Seed data is rigged: **Downtown** short on tomatoes, **Marina** holds surplus tomatoes near expiry,
**Mission** holds surplus basil near expiry.

1. Trigger the weekly cycle. Branches post demand on `#demand`; Downtown flags a tomato shortage.
2. **Anycast:** Marina claims it (near-expiry surplus) → coordinator confirms **move 10 kg
   tomatoes Marina → Downtown**.
3. Net shortage escalates → suppliers bid → owner approves **buy 26 kg from Bay Foods @ $2.05 =
   $53.30** (Bay Foods won on price vs NorCal).
4. Promotion sweep turns Mission's basil surplus into a **"Pesto Night — Pesto Penne 20% off"**.
5. A diner asks the Concierge if the Margherita is available tonight → confident yes, because the
   mesh just restocked it.

The [Mesh Console](https://k3trn3a2.insforge.site/mesh.html) replays this negotiation for the
stage. Full script: [docs/architecture.md](docs/architecture.md) · [docs/cotal-mesh.md](docs/cotal-mesh.md).
