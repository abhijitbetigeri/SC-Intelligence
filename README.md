# Mise — Intelligence Supply Chain for Restaurants

AGI Summit 2026 Hackathon · a multi-agent system that keeps the right ingredients in the
right branch at the right time, driven by real customer demand.

Owners get an autonomous back-of-house supply chain (demand forecasting, cross-branch
rebalancing, procurement, surplus-driven promotions). Consumers get **predictable
availability** of the dishes they love.

Full design + demo script: [docs/architecture.md](docs/architecture.md).

> **Status:** the agent layer is **live on Runtype** — 5 capabilities (forecast, the
> rebalance+procurement showpiece, promotion sweep, consumer concierge, inventory admin),
> 3 chat surfaces, eval suites, all smoke-tested. Resource IDs and how to run each are in
> [runtype/BUILD.md](runtype/BUILD.md). A branch-admin **inventory dashboard UI** with the
> embedded [Persona](https://github.com/runtypelabs/persona) chat widget lives in
> [web/branch-admin.html](web/branch-admin.html) ([web/](web/)). The **InsForge** Postgres
> backend is provisioned (schema + seed) — see [INSFORGE.md](INSFORGE.md).

## Stack

| Layer | Tool |
|-------|------|
| Agent coordination mesh | **Cotal.ai** — branches & suppliers as agent nodes ([cotal.yaml](cotal.yaml)) |
| Agent runtime + surfaces | **Runtype** — agents/flows deployed to owner + consumer surfaces ([runtype/agents.md](runtype/agents.md)) |
| Backend / state | **InsForge** — Postgres, auth, realtime, pgvector ([db/schema.sql](db/schema.sql)) |
| Reasoning | **Anthropic** (`claude-sonnet-5` / `claude-opus-4-8`) |

## Repo layout

```
docs/architecture.md   design, agent topology, demo script
db/schema.sql          InsForge Postgres schema
db/seed.sql            demo franchise (Trattoria Verde), 3 branches, menu, BOM, 60d sales
cotal.yaml             mesh manifest: branch + supplier agent nodes, channels
runtype/agents.md      agent + flow specs → Runtype resources
src/                   Python helpers (Anthropic) if needed
```

## Setup

### 1. InsForge backend
```bash
npx @insforge/cli login --user-api-key <UAK>
npx @insforge/cli create           # creates + links a project to this dir, writes AGENTS.md
# apply schema + seed (via CLI migrate or the dashboard SQL editor):
#   db/schema.sql   then   db/seed.sql
```
> ⚠ If the CLI reports `Connection to api.insforge.dev timed out`, the InsForge API is
> lagging (its response time is exceeding the CLI's ~15s timeout). Retry when it recovers —
> the endpoint is reachable, just slow. `curl -m 30 https://api.insforge.dev/` to check.

### 2. Runtype agents
```bash
claude mcp add --transport http runtype https://api.runtype.com/v1/mcp/protocol
# then restart Claude Code and authorize via /mcp so the runtype tools load
```
Build the resources from [runtype/agents.md](runtype/agents.md) in this order:
Tools → `forecast` + `inventory-planner` Flows → `rebalance-coordinator` + `procurement`
Agents → `promotion-sweep` Flow → `consumer-concierge` Agent → attach surfaces.

### 3. Cotal mesh
```bash
npx cotal-ai setup
cotal up --detach
cotal spawn rebalance-coordinator   # then each branch + supplier agent, per terminal
cotal web                           # dashboard / live activity
```

## The demo (5 min)

Seed data is rigged so the loops fire on the first run: **Downtown** is short on tomatoes,
**Marina** holds surplus tomatoes near expiry, **Mission** holds surplus basil near expiry.

1. Weekly run → branches post demand; Downtown flags a tomato shortage.
2. Marina offers surplus (anycast) → Rebalance Coordinator confirms a B→A transfer.
3. Net shortage escalates → supplier bids → owner approves one PO in Slack.
4. Promotion agent turns Mission's surplus basil into a "Pesto Night" special.
5. Consumer asks the Concierge if the Margherita is available tonight → confident yes.

See [docs/architecture.md](docs/architecture.md#demo-script-5-min) for the full script.
