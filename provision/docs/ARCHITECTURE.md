# Architecture

## Runtime shape

ONE Node/Express (ESM) process serves the built React + Vite SPA *and* the JSON API on a
single port. `app/.env.production` sets `VITE_API_URL=` (empty), so the production bundle
calls the same origin it was served from — a build needs no shell env, and hosting is one
port, not two.

```
app/      React + Vite SPA (komodos-ui design system)
server/   Express API + records repository + simulation + seams
deploy/   run.sh — runs the server with cwd here, so state lands in deploy/.data
docs/     this
```

In development the SPA runs on :5173 and Vite proxies `/api`, `/auth` and `/admin` to the
API on :8788. Nothing about the code changes between the two modes.

## The records repository is the load-bearing abstraction

```js
records.create(type, fields, actor)
records.list(type, filter)
records.get(id) · records.update(id, patch) · records.remove(id)
```

Every domain object is a record with a `type`: `supplier`, `item`, `po`, `guest`,
`ticketday`, `rule`. A new object type costs nothing. Records carry `id, type, createdAt,
updatedAt, createdBy` plus their own fields.

**Demo mode** persists to `server/.data/*.json` via `persist.js`. **Production** puts an
InsForge Postgres driver behind the same five methods. Views and routes never change — that
is the entire point of the seam.

## Simulate-first

`server/simulate.js` is a deterministic generator (mulberry32, fixed `SIM_SEED`). It seeds
6 suppliers, 18 SKUs, 8 guests and 60 days of sales tickets. No `Math.random` anywhere, so
the same venue appears on every boot and every request.

**Sales tickets are the source of truth.** Demand forecasts and guest predictions are both
computed *from* the tickets rather than authored, which is why the UI can always show its
work ("16 sold in the last 14 days (1.14/day)"). Stock levels are authored so the demo opens
on a specific, defensible picture.

## Forecasting (transparent heuristics)

`server/forecast.js` — deliberately legible arithmetic, with a seam for a real model later.

- **Demand**: rolling daily average over a 14-day window × a day-of-week shape factor,
  projected across the supplier's lead time plus a 2-day safety buffer.
- **Supplier choice**: `0.45·cost + 0.30·lead + 0.25·reliability` — but **feasibility comes
  first**. An option whose lead time exceeds the days of stock remaining cannot solve the
  problem no matter how cheap it is, so infeasible options never outrank feasible ones. The
  rejected option is surfaced with its reason ("cheaper at $2.85 but arrives in 4d — 2.3d of
  stock left") rather than hidden.
- **Order size**: cover the forecast, refill to par, respect MOQ, round to whole units.
- **Guest prediction**: recency-weighted affinity over the guest's own tickets (weight decays
  `e^(-days/60)`), venue popularity only as a labelled fallback when history is too thin.
  Confidence is capped at 88% — a heuristic should not imply certainty it does not have.

## Human-in-the-loop

A reorder **always** writes a PO record in stage `draft` first. `dispatchReorder` (the
purchasing seam) is the only path out of the building, and it is reached only when:

- an operator clicks **Send to supplier**, or
- an operator-set rule authorises it (`auto-send` with a per-order ceiling).

PO lifecycle: `draft → sent → confirmed → received → reconciled`, each transition appending
`{from, to, at, by}` to the record's history.

## Graduation path

Three layers, composed rather than duplicated:

| Layer | Role | Gate |
|---|---|---|
| **InsForge** | state / auth / files / LLM gateway (agent ↔ backend) | `INSFORGE_URL` + `INSFORGE_KEY` |
| **Runtype** | individual agents, tools, schedules (agent ↔ tools, over MCP) | `RUNTYPE_TOKEN` |
| **Cotal** | many agents coordinating (agent ↔ agents, over NATS) | `COTAL_URL` + `COTAL_JWT` |

All three live in `server/seams.js`, are OFF by default, and log exactly what they *would*
have called (`[seam:cotal.multicast] would publish 'low-stock' to #purchasing`). `GET
/api/seams` returns the recent log; `GET /api/health` reports each subsystem's mode.

Recommended order:

1. `records` → InsForge Postgres (driver behind `persist.js` / `records.js`)
2. `auth` → InsForge Auth (replaces `auth.js` + `userStore.js`)
3. files → InsForge Storage (invoices, catalogs, price lists)
4. LLM → InsForge Model Gateway (co-pilot, invoice parsing, embeddings)
5. agents → Runtype over MCP (`reorder-decisioner`, `invoice-reconciler`, `guest-predictor`,
   `concierge`) + schedules for the par sweep and the pre-shift brief
6. Cotal — **only once there is more than one agent to coordinate**

### Flows once the layers are live

*Auto-reorder:* par sweep (Runtype schedule) reads InsForge → watcher **multicasts**
`low-stock` on Cotal → **anycast** to a `reorder-agent` → the decisioner drafts the PO
(Model Gateway forecast + InsForge data) → **supervised unicast** to approval → dispatch seam
(InsForge edge function) sends email/EDI/API → invoice → Storage → reconciler posts stock.

*Guest prediction:* reservation **multicasts** `vip-arriving` on `#floor` → **anycast** to a
`prediction-agent` → the guest-predictor ranks the order (embeddings + tickets via InsForge)
→ the at-table brief renders; the concierge persona fields follow-ups.

## Domain model

- **Supplier** — channels, per-SKU price / lead time / MOQ, terms, reliability
- **InventoryItem / SKU** — on hand, par, reorder point, unit cost, category, supplier options
- **PurchaseOrder** — lines, stage, channel, forecast snapshot, audit history
- **Guest** — tier (VIP / regular / lapsing), allergies, notes, average check, reservation
- **SalesTicket** — line items, check, day-part, server, table (stored per service day)
- **DemandForecast / Prediction** — computed on read, never stored stale

## Security posture

- Source text (invoices, catalogs) is **data, never instructions**.
- AI answers render through a sanitizing Markdown renderer; raw model output is never
  `innerHTML`'d.
- POs and guest data never auto-leave without an operator-set rule. Everything is audited.
- Secrets live in env, never committed. `server/.env.example` documents every switch.

## Not built yet

The scaffold stops at the first milestone. Next, in order: reorder notifications, the
receiving loop (invoice parse → reconcile → post stock with lot/expiry), richer guest
profiles with embeddings, co-pilot insights across both halves, then the infra graduation
and POS/supplier integrations.
