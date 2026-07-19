# InsForge backend — context & runbook

Everything a collaborator (or a future session) needs to work with the InsForge backend
for this project. InsForge is the **intended production backend**, now **provisioned** (schema +
seed applied and verified). The live demo runs on Runtype's native record store (see
[runtype/BUILD.md](runtype/BUILD.md)); to move onto InsForge, re-point the Runtype record
reads/writes at InsForge-backed tools/edge functions that mirror [db/schema.sql](db/schema.sql).

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

## Current status (2026-07-19)

- ✅ Authenticated + linked to `k3trn3a2`. `AGENTS.md` and `.insforge/project.json` written.
- ✅ **Schema applied** — all 17 tables + the `menu_item_availability` view created from
  [db/schema.sql](db/schema.sql) (both `uuid-ossp` and `vector`/pgvector extensions worked).
- ✅ **Seed applied + verified** — 3 branches, 5 menu items, 18 inventory rows, **900 sales
  rows** (the 60-day `generate_series` history), 2 favorites. Rigged state confirmed: Downtown
  tomatoes 4 (short), Marina tomatoes 34 (surplus), Mission basil 3.5 (surplus).
- The backend is live and healthy; DB ops now round-trip in ~2–3s.

## Resolved: the earlier slow/timeout fault was transient

For hours the **per-project host** `k3trn3a2.us-east.insforge.app` showed ~6s TCP connect +
~14s TLS + `db query` hanging ~65s, while the **central API** (`api.insforge.dev`) stayed fast
(~0.5s) — so it was host/path-specific, not the network or the central API. It later cleared on
its own (InsForge confirmed the instance was idle, not overloaded); schema + seed then applied in
~2–3s each. If it recurs, re-check with:

```bash
curl -sS -o /dev/null -m 25 \
  -w "connect=%{time_connect}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s total=%{time_total}s http=%{http_code}\n" \
  https://k3trn3a2.us-east.insforge.app/
# Healthy: connect < 0.5s, tls < 0.5s, total < 2s.  (Compare against api.insforge.dev to isolate
# host-specific vs network-wide.)  Escalate on the project instance k3trn3a2, not the central API.
```

## Re-applying / resetting the data

Schema and seed are already applied. To re-seed from scratch (idempotent-ish; `schema.sql` uses
`if not exists`, `seed.sql` uses fixed UUIDs so re-running collides — truncate first):

```bash
npx @insforge/cli db import db/schema.sql        # DDL (safe to re-run)
npx @insforge/cli db import db/seed.sql          # data (fixed UUIDs — clear tables first to re-run)
npx @insforge/cli db query "select count(*) from sales" --json    # expect 900
```

Notes:
- RLS (owner vs consumer) is described at the bottom of `schema.sql` but not yet enabled — add
  policies via a migration when auth roles are wired.
- `embedding vector(1536)` columns exist but are unused so far (pgvector matching is a later feature).

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
