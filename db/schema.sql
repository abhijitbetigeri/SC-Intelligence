-- Mise — Intelligence Supply Chain for Restaurants
-- InsForge Postgres schema
--
-- Apply with the InsForge CLI (after `npx @insforge/cli create` / `link`):
--   npx @insforge/cli migrate ...   (or run this SQL via the dashboard SQL editor)
--
-- Conventions: snake_case, UUID PKs, created_at/updated_at, FK cascades within a franchise.
-- RLS notes at the bottom (owner vs consumer). pgvector used for dish/ingredient matching.

create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- ── Org: franchise → branches ───────────────────────────────────────────────
create table franchises (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table branches (
  id           uuid primary key default uuid_generate_v4(),
  franchise_id uuid not null references franchises(id) on delete cascade,
  name         text not null,
  city         text,
  -- lat/lon so the rebalance coordinator can prefer nearby branches for transfers
  lat          double precision,
  lon          double precision,
  created_at   timestamptz not null default now()
);
create index on branches (franchise_id);

-- ── Catalog: ingredients (products) & suppliers ─────────────────────────────
create table products (               -- raw ingredients / SKUs
  id              uuid primary key default uuid_generate_v4(),
  franchise_id    uuid not null references franchises(id) on delete cascade,
  sku             text,
  name            text not null,      -- "Roma tomatoes"
  unit            text not null default 'kg',  -- kg, l, each
  shelf_life_days int  not null default 7,     -- drives near-expiry / waste logic
  embedding       vector(1536),       -- for "find substitutable ingredient" (pgvector)
  created_at      timestamptz not null default now()
);
create index on products (franchise_id);

create table suppliers (
  id           uuid primary key default uuid_generate_v4(),
  franchise_id uuid not null references franchises(id) on delete cascade,
  name         text not null,
  lead_time_days int not null default 2,
  created_at   timestamptz not null default now()
);

-- what a supplier can provide and at what price (drives RFQ bids)
create table supplier_products (
  id           uuid primary key default uuid_generate_v4(),
  supplier_id  uuid not null references suppliers(id) on delete cascade,
  product_id   uuid not null references products(id) on delete cascade,
  unit_price   numeric(10,2) not null,
  min_order    numeric(10,2) not null default 0,
  unique (supplier_id, product_id)
);

-- ── Menu & recipe BOM (bill of materials) ───────────────────────────────────
create table menu_items (
  id           uuid primary key default uuid_generate_v4(),
  franchise_id uuid not null references franchises(id) on delete cascade,
  name         text not null,         -- "Margherita Pizza"
  price        numeric(10,2) not null default 0,
  popularity   int not null default 0,  -- cached rank; refreshed from sales
  embedding    vector(1536),          -- "recommend a similar in-stock dish"
  created_at   timestamptz not null default now()
);
create index on menu_items (franchise_id);

-- how much of each ingredient one serving consumes
create table menu_item_ingredients (
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  product_id   uuid not null references products(id) on delete cascade,
  qty_per_serving numeric(10,4) not null,   -- e.g. 0.15 kg tomatoes per pizza
  primary key (menu_item_id, product_id)
);

-- ── Inventory: stock per branch per ingredient ──────────────────────────────
create table inventory (
  id            uuid primary key default uuid_generate_v4(),
  branch_id     uuid not null references branches(id) on delete cascade,
  product_id    uuid not null references products(id) on delete cascade,
  qty_on_hand   numeric(12,3) not null default 0,
  par_level     numeric(12,3) not null default 0,  -- target stock (set by Planner)
  reorder_point numeric(12,3) not null default 0,  -- restock when below this
  earliest_expiry date,                            -- nearest lot expiry → waste risk
  updated_at    timestamptz not null default now(),
  unique (branch_id, product_id)
);
create index on inventory (branch_id);

-- ── Sales history (drives the forecast) ─────────────────────────────────────
create table sales (
  id           uuid primary key default uuid_generate_v4(),
  branch_id    uuid not null references branches(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  qty          int not null,
  sold_at      timestamptz not null default now()
);
create index on sales (branch_id, menu_item_id, sold_at);

-- ── Forecasts (written by the Forecast agent) ───────────────────────────────
create table forecasts (
  id            uuid primary key default uuid_generate_v4(),
  branch_id     uuid not null references branches(id) on delete cascade,
  menu_item_id  uuid not null references menu_items(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  predicted_qty int not null,
  confidence    numeric(4,3) not null default 0.5,  -- 0..1, used for consumer availability
  created_at    timestamptz not null default now()
);
create index on forecasts (branch_id, period_start);

-- ── Rebalancing (branch ↔ branch transfers, the Cotal loop) ─────────────────
create table rebalance_transfers (
  id             uuid primary key default uuid_generate_v4(),
  franchise_id   uuid not null references franchises(id) on delete cascade,
  product_id     uuid not null references products(id) on delete cascade,
  from_branch_id uuid not null references branches(id),
  to_branch_id   uuid not null references branches(id),
  qty            numeric(12,3) not null,
  status         text not null default 'proposed',  -- proposed|approved|in_transit|done|rejected
  reason         text,                              -- agent's rationale
  created_at     timestamptz not null default now()
);
create index on rebalance_transfers (franchise_id, status);

-- ── Procurement (RFQ → supplier bids → PO) ──────────────────────────────────
create table rfqs (
  id           uuid primary key default uuid_generate_v4(),
  franchise_id uuid not null references franchises(id) on delete cascade,
  product_id   uuid not null references products(id) on delete cascade,
  qty          numeric(12,3) not null,
  needed_by    date,
  status       text not null default 'open',        -- open|awarded|closed
  created_at   timestamptz not null default now()
);

create table bids (                    -- supplier agent responses (anycast claims)
  id          uuid primary key default uuid_generate_v4(),
  rfq_id      uuid not null references rfqs(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  unit_price  numeric(10,2) not null,
  eta_days    int not null,
  created_at  timestamptz not null default now()
);

create table purchase_orders (
  id           uuid primary key default uuid_generate_v4(),
  franchise_id uuid not null references franchises(id) on delete cascade,
  branch_id    uuid references branches(id),   -- destination branch (nullable = franchise stock)
  supplier_id  uuid not null references suppliers(id),
  product_id   uuid not null references products(id),
  qty          numeric(12,3) not null,
  unit_price   numeric(10,2) not null,
  status       text not null default 'pending', -- pending|approved|ordered|received|rejected
  created_at   timestamptz not null default now()
);
create index on purchase_orders (franchise_id, status);

-- ── Promotions (written by the Promotion agent, goal 2) ─────────────────────
create table promotions (
  id           uuid primary key default uuid_generate_v4(),
  branch_id    uuid not null references branches(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  kind         text not null default 'discount',  -- discount|bundle|special
  discount_pct int,
  headline     text not null,           -- "Pesto Night — 20% off while the basil is fresh"
  reason       text,                    -- agent rationale (surplus/near-expiry)
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz,
  status       text not null default 'active',    -- active|expired|cancelled
  created_at   timestamptz not null default now()
);
create index on promotions (branch_id, status);

-- ── Consumers & favorites (goal 3) ──────────────────────────────────────────
create table consumers (
  id          uuid primary key default uuid_generate_v4(),
  -- links to InsForge auth user id when signed in
  auth_user_id uuid,
  display_name text,
  created_at  timestamptz not null default now()
);

create table favorites (
  consumer_id  uuid not null references consumers(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  primary key (consumer_id, menu_item_id)
);

-- ── Availability view (goal 3): live + predicted availability per branch/item ─
-- A menu item is "available" if every ingredient's on-hand stock covers at least
-- one serving. Confidence blends current coverage with the latest forecast confidence.
--
-- Two corrections vs. the first cut:
--
-- 1. It failed OPEN on missing data. `inventory` is LEFT JOINed, so an ingredient with no
--    inventory row yields NULL, `NULL >= x` is NULL, and bool_and IGNORES NULLs -- meaning
--    a dish missing an ingredient entirely reported in_stock_now = true. coalesce(...,0)
--    makes a missing row count as zero stock, which is what it means.
--
-- 2. One serving is not availability. Downtown holds 4.0 kg of tomatoes and a Margherita
--    needs 0.150 kg, so the old view says "in stock" -- that is ~26 servings against a day
--    that needs ~31. servings_available exposes the real number so the concierge can stop
--    promising a dish that is about to 86. It is the min over ingredients of
--    (on_hand / qty_per_serving) -- the binding constraint.
create view menu_item_availability as
select
  mi.id            as menu_item_id,
  b.id             as branch_id,
  mi.name          as menu_item_name,
  b.name           as branch_name,
  bool_and(coalesce(inv.qty_on_hand, 0) >= mii.qty_per_serving)      as in_stock_now,
  floor(min(coalesce(inv.qty_on_hand, 0) / nullif(mii.qty_per_serving, 0)))::int
                                                                      as servings_available,
  coalesce(max(f.confidence), 0.5)                                    as forecast_confidence
from menu_items mi
join menu_item_ingredients mii on mii.menu_item_id = mi.id
join branches b on b.franchise_id = mi.franchise_id
left join inventory inv on inv.branch_id = b.id and inv.product_id = mii.product_id
left join forecasts f on f.branch_id = b.id and f.menu_item_id = mi.id
  and current_date between f.period_start and f.period_end
group by mi.id, b.id, mi.name, b.name;

-- ── RLS (apply in InsForge; see database/postgres-rls.md in the insforge skill) ─
-- Owners (franchise/branch managers): full read/write on their franchise's rows.
-- Consumers: read-only on menu_items, promotions (active), menu_item_availability;
--            read/write only their own consumers + favorites rows.
-- Enable RLS per table and add policies once auth roles are wired:
--   alter table inventory enable row level security;  ... etc.
