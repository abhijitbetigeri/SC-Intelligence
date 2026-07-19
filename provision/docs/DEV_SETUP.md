# Dev setup

Two Node processes: an Express (ESM) API and a Vite React SPA. In dev they run on separate
ports and the SPA proxies API calls; in production one process serves both (see
`../README.md`).

## Prerequisites

- Node ≥ 18 (`server/package.json` `engines`)
- npm

## Install

```sh
cd server && npm install
cd ../app && npm install
```

## Run (two processes, hot reload)

```sh
# terminal 1 — API on :8788, restarts on file change (node --watch)
cd server && npm run dev

# terminal 2 — SPA on :5173, proxies /api, /auth, /admin to :8788 (see app/vite.config.js)
cd app && npm run dev
```

Open **http://localhost:5173**. Sign in with any seeded seat, password `komodos`:

| Email | Role |
|---|---|
| `maria@komodos.local` | Owner-operator |
| `david@komodos.local` | General manager |
| `tim@komodos.local` | Beverage director |
| `sofia@komodos.local` | Floor lead |
| `admin@komodos.local` | Admin — "view as" any teammate |

Confirm the API is healthy directly: `curl http://localhost:8788/api/health` — every
subsystem should read `local` (or `grounded-fallback` for `llm`) until something is
configured in `.env`.

## Run (single port, production-shaped)

```sh
cd app && npm run build          # writes app/dist
cd ../server && npm start        # serves dist/ + API on :8788, no proxy involved
```

## Environment

Nothing is required — the app runs fully local with zero env vars. To change a switch, copy
`server/.env.example` to `server/.env`. Notable ones:

- `PORT` — API port, default `8788`
- `DEMO_PASSWORD` — password for all seeded seats, default `mise` (README says `komodos` —
  check whichever `.env` is actually loaded if sign-in fails)
- `PERSIST=off` — ephemeral in-memory records, no writes to `server/.data/`
- `SIM_SEED` — regenerate the simulated venue with a different (still deterministic) shape
- `ANTHROPIC_API_KEY` — co-pilot calls a real model instead of the grounded-fallback responder
- `INSFORGE_URL` / `INSFORGE_KEY`, `RUNTYPE_TOKEN`, `COTAL_URL` / `COTAL_JWT` — graduate
  records/auth/storage, agents, and multi-agent coordination off the local stack respectively

## Reset demo data

```sh
rm -rf server/.data && restart the server
```

The simulation seed is fixed, so the same venue, suppliers, and guests come back.

## Troubleshooting

- **Port already in use** — something else is bound to `:8788` or `:5173`:
  `lsof -i :8788 -sTCP:LISTEN` / `lsof -i :5173 -sTCP:LISTEN`, then kill or reassign `PORT`.
- **SPA loads but API calls 404/fail** — the API process isn't running, or you opened
  `:8788` before `npm run build` was ever run (dev mode serves the SPA from `:5173`, not
  `:8788`).
- **Sign-in fails** — check `DEMO_PASSWORD` in whatever `.env` the server actually loaded;
  it defaults to `mise` in code even though other docs say `komodos`.
