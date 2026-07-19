# Mise × Cotal — the multi-agent coordination layer

> The single most demoable moment in Mise: **branches that don't share a brain, negotiating
> stock with each other in real time.** This is what Cotal does that a single agent can't.

## Why Cotal (the use case)

A franchise is not one mind — it's **N independently-run branches plus M external suppliers**,
each of which only knows its own situation. Any *centralized* planner (a single Runtype agent that
reads everything and emits a plan) models that world incorrectly: it assumes one omniscient
controller. That is exactly the assumption reality violates.

Cotal models it the way it actually is: **every branch and every supplier is its own autonomous
agent node**, and they coordinate by *negotiating over channels* rather than by being told what to
do. That buys five things a single agent/flow fundamentally cannot give you:

| # | Property | Why it matters for a supply chain | A single agent can't… |
|---|----------|-----------------------------------|-----------------------|
| 1 | **Decentralization** | Each branch self-reports and self-claims. Add a 4th branch → it just joins the Space. | …scale without being rewired; it's one bottleneck brain. |
| 2 | **Real-time peer negotiation (anycast)** | A shortage is claimed by *whichever* surplus-holder answers first — a live trading floor, not a lookup. | …show agents *negotiating*; it just returns a value. |
| 3 | **Resilience & durability** | Durable delivery + replay: an offline branch catches up; the mesh survives a node dying. | …survive its own process dying mid-plan. |
| 4 | **A real supplier market** | Suppliers bid on RFQs via anycast — one wins. Genuine price competition. | …fake competitive tension convincingly. |
| 5 | **Auditability** | `#decisions` is an append-only log of what the *collective* decided. | …produce a distributed audit trail. |

**The one-line pitch:** *Mise turns each restaurant branch and supplier into an autonomous agent
that forecasts its own demand, trades surplus with its neighbors before anyone buys anything, and
only escalates the true net shortage to a live supplier auction — all on the Cotal mesh.*

## How the three layers fit

```
        COTAL  (coordination — the negotiation)
   branch nodes ⇄ #rebalance (anycast) ⇄ coordinator ⇄ #procurement ⇄ supplier nodes
        │  each node, when it must DECIDE, calls ↓
        ▼
      RUNTYPE  (reasoning — over the Mise MCP surface)
   weekly_forecast · inventory_admin · rebalance_and_procure · promotion_sweep
        │  reads/writes ↓
        ▼
     INSFORGE  (state — Postgres)
   inventory · forecasts · rebalance_transfers · rfqs · bids · purchase_orders
```

Cotal decides **who talks to whom and when**; Runtype decides **what the smart move is**; InsForge
**remembers**. Each is doing the job it's best at.

## Wiring a node to Runtype (the connector)

Cotal agents run natively as Claude Code, so the "connector" is just the Mise **MCP surface** —
no glue code. On each node:

```bash
export MISE_MCP_KEY=mcp_xxx      # the "Cotal Mesh key" surface key (keep it out of git)

claude mcp add --transport http mise \
  https://api.runtype.com/v1/products/prod_01kxvr3fcneskr35jfxqhekaj0/surfaces/surf_01kxvzxg98fqb8x1ngbe2a38q4/mcp \
  --header "Authorization: Bearer $MISE_MCP_KEY"
```

The node can now call `weekly_forecast`, `inventory_admin`, `rebalance_and_procure`, and
`promotion_sweep` as tools. State reads/writes go to InsForge (`k3trn3a2.us-east.insforge.app`).

## Running the mesh

```bash
npx cotal-ai setup
cotal up --detach
# spawn every node (each in its own process / terminal)
cotal spawn rebalance-coordinator
cotal spawn branch-downtown
cotal spawn branch-marina
cotal spawn branch-mission
cotal spawn procurement
cotal spawn supplier-norcal
cotal spawn supplier-bayfoods
cotal web                       # live activity dashboard
```

Manifest: [../cotal.yaml](../cotal.yaml). Seed state is rigged (Downtown short tomatoes, Marina
surplus tomatoes near-expiry, Mission surplus basil) so the loops fire on the first cycle.

## The on-stage demo (≈4 min) — the Cotal moment

Project **`cotal web`** (or the Mesh Console — see below) so the audience watches messages fly
between named agents.

1. **Boot the mesh.** 3 branch nodes + coordinator + procurement + 2 suppliers come online — presence lights up.
2. **Trigger the cycle.** Each branch calls `weekly_forecast`/`inventory_admin`, posts its posture to `#demand`. **Downtown posts `SHORTAGE tomatoes 36kg` on `#rebalance`.**
3. **Anycast negotiation.** Surplus-holders are addressed; **Marina claims it** — "I have 10kg, expiring in 2 days" — and proposes a transfer. The coordinator confirms → writes a `rebalance_transfers` row → posts to `#decisions`. *This is the agents-talking-to-agents beat.*
4. **Escalate only the net.** Coordinator sums the unmet 26kg and drops an RFQ on `#procurement`. **NorCal and Bay Foods both bid** (anycast); Bay Foods wins on price ($2.05). A pending PO goes to the owner.
5. **Owner approves** one clean card in Slack: *"Transfer 10kg Marina→Downtown, buy 26kg from Bay Foods for $53.30."*
6. **Surplus → revenue.** Mission's basil node flags near-expiry surplus on `#promotions` → "Pesto Night" special appears on the consumer app.
7. **Payoff.** A diner asks the Concierge if the Margherita is on tonight → *confident yes — because the mesh just restocked it.*

The feeling to land: **nobody is in charge, yet the right thing happens.**

## Mesh Console (stage visual)

[../web/mesh.html](../web/mesh.html) is a projectable console that visualizes this exact
choreography — the node topology plus a live channel feed (`#demand → #rebalance → #procurement →
#decisions`) streaming the tomato negotiation step by step. It replays the mesh choreography for a
rehearsable, legible stage visual; in a live run, project Cotal's own `cotal web` alongside it (or
feed real mesh events into the console). Hosted next to the branch-admin dashboard on InsForge.
