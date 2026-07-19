-- Mise — Market Intelligence schema
-- Multi-cuisine restaurant / menu / ingredient data scraped from the web by the
-- "Menu Intelligence" Runtype flow (Exa search -> Firecrawl scrape -> LLM extract).
-- Separate from the demo franchise (franchises/branches/...); prefixed mi_.
--
-- Apply:  npx @insforge/cli db import db/market-intel.sql

-- ── Cuisines (fixed catalog) ────────────────────────────────────────────────
create table if not exists mi_cuisines (
  id          text primary key,          -- 'italian','american','french',...
  name        text not null,
  created_at  timestamptz not null default now()
);

insert into mi_cuisines (id, name) values
  ('italian','Italian'),
  ('american','American'),
  ('french','French'),
  ('chinese','Chinese'),
  ('burmese','Burmese'),
  ('indian','Indian'),
  ('middle-eastern','Middle Eastern'),
  ('mexican','Mexican')
on conflict (id) do nothing;

-- ── Restaurants (top-N per cuisine) ─────────────────────────────────────────
create table if not exists mi_restaurants (
  id           uuid primary key default gen_random_uuid(),
  cuisine_id   text not null references mi_cuisines(id),
  name         text not null,
  rank         int,                       -- 1..N ranking within the cuisine
  website      text,
  source_url   text,                      -- where it was discovered / scraped
  summary      text,                      -- one-line description
  scraped_at   timestamptz not null default now(),
  unique (cuisine_id, name)
);
create index if not exists mi_restaurants_cuisine on mi_restaurants (cuisine_id);

-- ── Branches / locations per restaurant ─────────────────────────────────────
create table if not exists mi_branches (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references mi_restaurants(id) on delete cascade,
  name          text,                     -- e.g. "Downtown", "SoHo"
  address       text,
  city          text,
  region        text,                     -- state / country
  created_at    timestamptz not null default now()
);
create index if not exists mi_branches_restaurant on mi_branches (restaurant_id);

-- ── Menu dishes per restaurant ──────────────────────────────────────────────
create table if not exists mi_dishes (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references mi_restaurants(id) on delete cascade,
  name          text not null,
  section       text,                     -- appetizer / main / dessert / drink
  description   text,
  price         numeric(10,2),
  created_at    timestamptz not null default now()
);
create index if not exists mi_dishes_restaurant on mi_dishes (restaurant_id);

-- ── Ingredients per dish (core ingredients; may be derived) ─────────────────
create table if not exists mi_dish_ingredients (
  dish_id     uuid not null references mi_dishes(id) on delete cascade,
  ingredient  text not null,             -- normalized ingredient name
  is_core     boolean not null default true,
  derived     boolean not null default false,  -- true = inferred, not printed on menu
  primary key (dish_id, ingredient)
);

-- ── Convenience: ingredient demand across the whole market ──────────────────
-- Which ingredients appear most across scraped menus (supply-chain signal).
create or replace view mi_ingredient_frequency as
select
  di.ingredient,
  count(*)                              as dish_count,
  count(distinct d.restaurant_id)       as restaurant_count,
  count(distinct r.cuisine_id)          as cuisine_count
from mi_dish_ingredients di
join mi_dishes d      on d.id = di.dish_id
join mi_restaurants r on r.id = d.restaurant_id
group by di.ingredient
order by dish_count desc;
