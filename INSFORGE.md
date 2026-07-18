# InsForge backend — context & runbook

Everything a collaborator (or a future session) needs to work with the InsForge backend
for this project. InsForge is the **intended production backend**; the live demo currently
runs on Runtype's native record store (see [runtype/BUILD.md](runtype/BUILD.md)), so InsForge
is not yet on the critical path.

> ⚠️ **Never commit secrets.** The admin API key lives in `.insforge/project.json` (full-access,
> service-role-equivalent) and in `.env.local` for app code — both are gitignored. This file
> intentionally contains **no keys**, only IDs and hosts.

## Project identity

| Field | Value |
|-------|-------|
| Project name | **AGISummit** |
| Project ID | `9973a08c-1038-4b56-8c1f-12963bb6954b` |
| Org | `13e13d58-5141-47d1-8f97-1faf0052273a` ("My Organization", team) |
| appkey | `k3trn3a2` |
| Region | `us-east` |
| API base (`oss_host`) | `https://k3trn3a2.us-east.insforge.app` |
| Dashboard | https://insforge.dev/dashboard/project/9973a08c-1038-4b56-8c1f-12963bb6954b |

> There are **other** projects also named "AGISummit" under a different org (`9227d666…`,
> appkey `wg5byh9i`). This repo is deliberately linked to **`k3trn3a2`** — don't confuse them.

## First-time setup (collaborators)

The CLI is always run via `npx` (never install globally). Credentials are per-user, so each
collaborator links the project themselves:

```bash
# 1. Authenticate (each person uses their own InsForge account / user API key)
npx @insforge/cli login              # OAuth in browser
#   or: npx @insforge/cli login --user-api-key uak_xxx

# 2. Link THIS project to the repo dir (writes .insforge/project.json + AGENTS.md)
npx @insforge/cli link \
  --project-id 9973a08c-1038-4b56-8c1f-12963bb6954b \
  --org-id 13e13d58-5141-47d1-8f97-1faf0052273a -y

# 3. Sanity check
npx @insforge/cli current --json
npx @insforge/cli metadata --json    # auth config, tables, buckets, functions
```

## Current status (2026-07-18)

- ✅ Authenticated + linked to `k3trn3a2`. `AGENTS.md` and `.insforge/project.json` written.
- ✅ Backend is **empty** — backend version `1.0.0`, zero tables / buckets / functions.
- ❌ **Schema + seed NOT applied yet** — blocked by a project-host connectivity fault (below).

## ⚠️ Known issue: project host is slow/timing out on DB ops

The **central API** (`api.insforge.dev`) is healthy (~0.5s). The fault is on the **per-project
EC2 host** `k3trn3a2.us-east.insforge.app`:

```
GET /                        TCP connect 6.1s | TLS ~14s (done t=20.3s) | TTFB 24.5s → TIMEOUT@25s
GET /api/database/tables     connection timed out (couldn't connect in 25s)
GET /api/metadata            200, but TTFB 22s
db query "select 1"          ~65s then "fetch failed"
```

So control-plane reads (`metadata`, `migrations list`) occasionally squeak through, but anything
through PostgREST / the DB (schema, seed, queries) blows past the CLI's ~15s timeout.

**Root cause signature:** ~6s TCP connect + ~14s TLS handshake on the project EC2 — matches the
original slowness report. **When escalating to InsForge, ask them to check the health of the
project instance `k3trn3a2` (us-east) specifically, not the central API.**

Re-check health at any time:

```bash
curl -sS -o /dev/null -m 25 \
  -w "connect=%{time_connect}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s total=%{time_total}s http=%{http_code}\n" \
  https://k3trn3a2.us-east.insforge.app/
# Healthy target: connect < 0.5s, tls < 0.5s, total < 2s
```

## Pending work: apply schema + seed (do this once the host is healthy)

Source of truth: [db/schema.sql](db/schema.sql) (DDL + `menu_item_availability` view) and
[db/seed.sql](db/seed.sql) (Trattoria Verde demo data, rigged so the rebalance + Pesto promo
fire on the first run).

```bash
# Confirm the host is fast first (see curl check above), then:

# Schema via a migration (schema changes belong in migrations)
npx @insforge/cli db migrations new mise-schema      # creates migrations/<ts>_mise-schema.sql
#   → paste db/schema.sql into that file, then:
npx @insforge/cli db migrations up --all

# Seed data via raw SQL import (data, not schema)
npx @insforge/cli db import db/seed.sql

# Verify
npx @insforge/cli db tables
npx @insforge/cli db query "select name from branches" --json
```

Gotchas to watch when applying:
- Migrations run inside a backend-managed transaction — **no `BEGIN`/`COMMIT`** in the file.
- `schema.sql` uses `create extension "uuid-ossp"` and `vector` (pgvector). If either extension
  isn't permitted, switch `uuid_generate_v4()` → `gen_random_uuid()` and/or drop the `embedding
  vector(1536)` columns (pgvector matching is a "later" feature, not needed for the core demo).
- RLS (owner vs consumer) is noted at the bottom of `schema.sql` but not yet enabled — add
  policies via a migration when auth roles are wired.

## How InsForge relates to the rest of the stack

- **Runtype** (live demo, [runtype/BUILD.md](runtype/BUILD.md)) currently holds state in its own
  record store (`catalog`, `branch-state`, `forecast`, `promotion`, `transfer`, `po`, `consumer`).
  To move onto InsForge, re-point those record reads/writes at InsForge-backed tools/edge functions
  mirroring `db/schema.sql`.
- **Cotal** ([cotal.yaml](cotal.yaml)) is the future multi-agent mesh layer (supplier RFQ/anycast).

## Handy CLI reference (all via `npx @insforge/cli`)

| Task | Command |
|------|---------|
| Who am I / linked project | `whoami` · `current --json` |
| Backend overview | `metadata --json` |
| Inspect schema | `db tables` · `db indexes` · `db policies` |
| Run SQL (data/inspection) | `db query "<sql>" --json` |
| Migrations | `db migrations list \| new <name> \| up --all` |
| Import / export | `db import <file>` · `db export --output <file>` |
| Logs | `logs insforge.logs` · `logs postgres.logs` |
| Health | `diagnose` · `diagnose db` |
| AI key for app code | `ai setup` (writes `OPENROUTER_API_KEY` to `.env.local`) |
