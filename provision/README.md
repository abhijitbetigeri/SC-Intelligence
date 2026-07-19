# Komodos Provision

> The supply chain and the guest, both on autopilot: stock reorders itself before you 86 a
> listing, and every regular is greeted with what they'll probably want — grounded in real
> tickets, always operator-approved.

A restaurant supply-chain and guest-intelligence platform for owner-operators, GMs, beverage
directors and floor leads of upscale independents. Two headline capabilities:

1. **Autonomous supply chain.** Inventory watches itself against par levels. When something
   runs low, demand is forecast over the supplier's lead time, a PO is drafted to the best
   supplier (cost × lead time × reliability, honouring MOQ), and — per an operator-set rule
   (*notify me* · *auto-draft* · *auto-send under $X*) — it is sent.
2. **Predictive guest ordering.** Guest profiles are built from sales tickets. When a regular
   is booked, their likely order is predicted with a confidence and a one-line server script,
   grounded in *their* tickets first and venue trends second — never invented.

## Run it

The app runs with **zero external services**: local JSON records, deterministic seeded demo
data, and a grounded-fallback co-pilot.

```sh
# 1. install
cd server && npm install
cd ../app && npm install

# 2. build the SPA (produces app/dist)
npm run build

# 3. one process serves the SPA and the API on one port
cd ../server && npm start        # → http://localhost:8788
```

Sign in with any demo seat, password `komodos`:

| Email | Role | Sees |
|---|---|---|
| `maria@komodos.local` | Owner-operator | Overview, Stock, Tonight's guests |
| `david@komodos.local` | General manager | Overview, Stock, Tonight's guests |
| `tim@komodos.local` | Beverage director | Overview, Stock |
| `sofia@komodos.local` | Floor lead | Overview, Tonight's guests |
| `admin@komodos.local` | Admin | Everything + "view as" any teammate |

### Developing

```sh
cd server && npm run dev      # API on :8788, restarts on change
cd app && npm run dev         # SPA on :5173, proxies /api to :8788
```

## What is real vs simulated

Everything on screen is computed from records, not hardcoded copy — but the records
themselves are seeded from a deterministic generator (`server/simulate.js`, fixed seed), so
the same suppliers, stock levels, guests and 60 days of sales tickets appear on every boot.

`GET /api/health` reports each subsystem's mode honestly:

```json
{ "mode": "local",
  "subsystems": { "records": "local", "auth": "local", "storage": "local",
                  "llm": "grounded-fallback", "agents": "local", "mesh": "local" } }
```

The header chip reads **Demo · local data** until a subsystem is actually connected.

## Architecture

One Node/Express (ESM) process serves the built React + Vite SPA *and* the JSON API on a
single port. `app/.env.production` sets `VITE_API_URL=` (empty) so the production build calls
the same origin it was loaded from — `npm run build` needs no shell env.

The **records repository** (`server/records.js`) is the objects layer: `records.create /
list / update / remove(type, …)`. Suppliers, items, POs, guests, tickets and rules are all
records of a different type. In demo mode it persists to `server/.data/*.json`; behind the
same interface an InsForge Postgres driver takes over, and no view or route changes.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the seams, the graduation path
(InsForge / Runtype / Cotal), and the domain model.

## Guardrails

- **Draft → approve → send, always.** A PO is always recorded before it is dispatched, and it
  only leaves the building when an operator approves it or an operator-set rule authorises it.
  Every state change is audited with who, when, and from→to.
- **Nothing is invented.** Forecasts and predictions are transparent arithmetic over the
  tickets, and the UI shows the numbers behind every call. Where history is too thin, the card
  says so ("grounded in venue trends") instead of faking confidence.
- **Runs disconnected.** InsForge, Runtype and Cotal are env-gated behind documented seams
  that log what they *would* have called. Nothing silently reaches a third party.
- Secrets live in `.env` (gitignored); `server/.env.example` documents every switch.

## Design system

UI is built on the **komodos-ui** and **komodos-chat-ui** skills
(`~/.claude/skills/`, sourced from `BrandonKNguyen192/komodos-skills`): warm cream / white /
dark three-theme cycle, ONE deep green accent with red reserved for risk, Figtree, floating
cards, pills, sentence case, monochrome SVG line icons (never emoji), tabular numerals.
