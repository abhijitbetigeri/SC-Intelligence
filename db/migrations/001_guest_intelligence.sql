-- ─────────────────────────────────────────────────────────────────────────────
-- 001 — Guest intelligence
--
-- Adds the data the second headline capability needs: predicting what a known
-- diner will probably order, grounded in THEIR OWN history first and venue
-- trends only as a labelled fallback.
--
-- Today `sales` records what was sold but not WHO bought it, and `consumers`
-- holds a display name and nothing else — so a per-guest prediction has no
-- basis to stand on. This migration closes that gap.
--
-- DESIGN CONSTRAINT — nothing here may change a single forecast number.
-- The 60-day / 900-row `sales` history is what `weekly_forecast` reads and what
-- the eval suites are graded against. So:
--   * every column added is NULLABLE, with no default that rewrites rows;
--   * guest attribution is an UPDATE of `consumer_id` only — no rows inserted,
--     deleted, or re-quantified, so every sum/avg/group-by is byte-identical;
--   * nothing existing is dropped or renamed.
-- Re-runnable: every statement is `if not exists` / idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Guest profile ────────────────────────────────────────────────────────
-- Extends `consumers` in place rather than adding a parallel table, so the
-- concierge agent's existing consumer reads keep working untouched.
alter table consumers add column if not exists tier         text;              -- vip|regular|lapsing|new
alter table consumers add column if not exists allergies    text[] default '{}';
alter table consumers add column if not exists notes        text;              -- one line, shown on the card
alter table consumers add column if not exists first_seen   date;
alter table consumers add column if not exists lifetime_value numeric(10,2);

comment on column consumers.tier is
  'vip|regular|lapsing|new — drives whether the guest surfaces in the pre-shift brief.';
comment on column consumers.allergies is
  'Free-text allergens matched against menu_item_ingredients. A hard constraint: an item that '
  'conflicts is never suggested, no matter how strong the affinity.';

-- ── 2. Attribution ──────────────────────────────────────────────────────────
-- The one column that turns aggregate sales into per-guest history. Nullable on
-- purpose: an unattributed row is a walk-in, which is most of them, and that is
-- the honest default rather than inventing an owner for every ticket.
alter table sales add column if not exists consumer_id uuid references consumers(id) on delete set null;
create index if not exists sales_consumer_idx on sales (consumer_id, sold_at desc);

comment on column sales.consumer_id is
  'Null = walk-in. Set only where a ticket is genuinely tied to a known diner.';

-- ── 3. Reservations ─────────────────────────────────────────────────────────
-- "Tonight's VIPs" is a question about the book, not about sales, so it needs
-- its own table. Party size and the covers time drive the pre-shift brief order.
create table if not exists reservations (
  id           uuid primary key default uuid_generate_v4(),
  branch_id    uuid not null references branches(id) on delete cascade,
  consumer_id  uuid references consumers(id) on delete set null,  -- null = walk-in booking
  starts_at    timestamptz not null,
  party_size   int not null default 2,
  status       text not null default 'booked',   -- booked|seated|completed|cancelled
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists reservations_branch_time_idx on reservations (branch_id, starts_at);
create index if not exists reservations_consumer_idx on reservations (consumer_id);

-- ── 4. Guest affinity ───────────────────────────────────────────────────────
-- The prediction basis, expressed in SQL so the arithmetic is inspectable rather
-- than hidden in a model. Recency-weighted frequency: a dish ordered last week
-- counts for more than the same dish ordered two months ago (half-life ~30d).
--
-- Deliberately NOT a forecast of the venue — it is scoped per consumer. A caller
-- that finds no rows for a guest must say so and fall back to venue trends with
-- that fallback labelled, never silently.
create or replace view guest_item_affinity as
select
  s.consumer_id,
  s.menu_item_id,
  mi.name                                as menu_item_name,
  count(*)                               as times_ordered,
  max(s.sold_at)                         as last_ordered_at,
  -- exp(-days / 30) recency decay, summed over the guest's tickets
  round(sum(exp(-extract(epoch from (now() - s.sold_at)) / (30 * 86400.0)))::numeric, 4)
                                         as affinity_score
from sales s
join menu_items mi on mi.id = s.menu_item_id
where s.consumer_id is not null
group by s.consumer_id, s.menu_item_id, mi.name;

comment on view guest_item_affinity is
  'Recency-weighted per-guest item affinity (half-life ~30 days). Ranking basis for the '
  'predicted order; pair with menu_item_availability so nothing out of stock is ever suggested.';
