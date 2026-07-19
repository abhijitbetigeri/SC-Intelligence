# komodos-provision

Restaurant supply-chain and guest-intelligence platform. Two headline capabilities: stock
that reorders itself before you 86 a listing, and guests greeted with what they'll probably
want — both grounded in real sales tickets, both operator-approved.

Built for a hackathon. `docs/ARCHITECTURE.md` is the reference; `README.md` is how to run it.

## Current state (first milestone — scaffold)

- **Runtime**: one Express (ESM) process serves `app/dist` *and* the JSON API on one port
  (:8788). `app/.env.production` sets `VITE_API_URL=` so the build is same-origin.
- **Records repository** (`server/records.js`) is the objects layer — `create/list/get/
  update/remove(type, …)`. Types: `supplier`, `item`, `po`, `guest`, `ticketday`, `rule`.
  Durable via `persist.js` → `server/.data/*.json` (gitignored).
- **Simulation** (`server/simulate.js`): deterministic mulberry32, fixed `SIM_SEED`. Seeds
  6 suppliers, 18 SKUs, 8 guests, 60 days of tickets. **No `Math.random` anywhere.**
  Sales tickets are the source of truth; forecasts and predictions are computed from them.
- **Forecasting** (`server/forecast.js`): transparent heuristics only. Demand = 14-day moving
  average × day-of-week factor across lead time + 2-day buffer. Supplier choice weights
  cost/lead/reliability but **feasibility wins first** (an option that arrives after you run
  out never outranks one that doesn't). Guest prediction = recency-weighted affinity over
  their own tickets, venue trends only as a labelled fallback. Confidence caps at 88%.
- **Views**: Overview (KPIs + computed insight feed), Stock (par board, needs-attention
  panel, reorder → draft PO → confirm), Tonight's guests (predicted order + server script),
  Users & access (read-only directory). Co-pilot drawer on every view.
- **Auth/RBAC**: local JWT + scrypt, role → dashboards, admin "view as" impersonation.
- **Seams** (`server/seams.js`): InsForge / Runtype / Cotal are env-gated and OFF. They log
  what they *would* have called. `/api/health` reports each subsystem's mode honestly.

## Conventions

- **Draft → approve → send, always.** A PO is recorded before it is dispatched.
  `dispatchReorder` in `purchasing.js` is the ONLY path out of the building, reached only via
  an operator approval or an operator-set `auto-send` rule with a ceiling. Audit every
  transition with `{from, to, at, by}`.
- **Never invent a number.** If the data is too thin, say so on the card ("grounded in venue
  trends") rather than faking confidence. The UI shows the arithmetic behind every call.
- **Runs disconnected.** Any new integration goes behind a seam that no-ops and logs by
  default. The app must stay fully demoable with nothing configured.
- **UI**: the `komodos-ui` + `komodos-chat-ui` skills (installed at `~/.claude/skills/`,
  source `BrandonKNguyen192/komodos-skills`). ONE green accent for state, red for risk only,
  sentence case, 11px uppercase micro-labels as the only uppercase, floating cards that never
  share a hairline grid, tabular numerals, **monochrome SVG line icons — never emoji**.
- Copy is calm and specific: no exclamation marks, no Title Case headers, no "Oops!".

## Build order from here

1. ~~Scaffold~~ (done)
2. **Supply MVP** — reorder notifications + the full PO lifecycle past `sent`
3. **Receiving loop** — invoice parse (Model Gateway) → reconcile against PO → post stock
   with lot/expiry → flag variances
4. **Guest MVP** — richer profiles, embeddings-based prediction, pre-shift + at-table briefs
5. **Co-pilot + insights** across both halves
6. **Graduate to infra** — records → InsForge Postgres, auth → InsForge Auth, files →
   Storage, LLM → Model Gateway; agents onto Runtype via MCP; Cotal once >1 agent
7. **Integrations** — POS (Square/Toast/Lightspeed) + a first real supplier channel

## Related

- `BrandonKNguyen192/restaurant-unification-platform` — the sibling operator hub this lifted
  its patterns from (records store, dispatch seam, automations, connectors). Do not modify
  it from here.
