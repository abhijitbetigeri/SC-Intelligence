-- Mise — demo seed data
-- One franchise ("Trattoria Verde"), 3 branches, 5 menu items, 6 ingredients,
-- recipe BOM, 2 suppliers, ~60 days of sales history, and inventory rigged so the
-- rebalance + promotion demos fire on the first run.
--
-- Fixed UUIDs so the demo is scriptable. Run after schema.sql.

-- ── Franchise & branches ────────────────────────────────────────────────────
insert into franchises (id, name) values
  ('f0000000-0000-0000-0000-000000000001', 'Trattoria Verde');

insert into branches (id, franchise_id, name, city, lat, lon) values
  ('b0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-000000000001', 'Downtown',  'San Francisco', 37.7897, -122.4000),
  ('b0000000-0000-0000-0000-00000000000b', 'f0000000-0000-0000-0000-000000000001', 'Marina',    'San Francisco', 37.8030, -122.4360),
  ('b0000000-0000-0000-0000-00000000000c', 'f0000000-0000-0000-0000-000000000001', 'Mission',   'San Francisco', 37.7599, -122.4148);

-- ── Ingredients ─────────────────────────────────────────────────────────────
insert into products (id, franchise_id, sku, name, unit, shelf_life_days) values
  ('a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'TOM-ROMA', 'Roma tomatoes',   'kg', 6),
  ('a0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 'MOZZ',     'Mozzarella',      'kg', 12),
  ('a0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001', 'BASIL',    'Fresh basil',     'kg', 3),
  ('a0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000001', 'FLOUR',    '00 flour',        'kg', 180),
  ('a0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000001', 'PENNE',    'Penne pasta',     'kg', 365),
  ('a0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000001', 'OLIVEOIL', 'Olive oil',       'l',  365);

-- ── Menu items ──────────────────────────────────────────────────────────────
insert into menu_items (id, franchise_id, name, price) values
  ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Margherita Pizza',   16.00),
  ('c0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 'Marinara Pizza',     14.00),
  ('c0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001', 'Pesto Penne',        18.00),
  ('c0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000001', 'Caprese Salad',      12.00),
  ('c0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000001', 'Penne Arrabbiata',   15.00);

-- ── Recipe BOM (qty per serving) ────────────────────────────────────────────
insert into menu_item_ingredients (menu_item_id, product_id, qty_per_serving) values
  -- Margherita: tomatoes, mozzarella, basil, flour
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 0.150),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 0.120),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 0.010),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 0.250),
  -- Marinara: tomatoes, flour
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 0.180),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 0.250),
  -- Pesto Penne: basil, penne, olive oil
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 0.030),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 0.120),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000006', 0.020),
  -- Caprese: tomatoes, mozzarella, basil
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 0.120),
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 0.100),
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 0.015),
  -- Arrabbiata: tomatoes, penne, olive oil
  ('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 0.160),
  ('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005', 0.120),
  ('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000006', 0.015);

-- ── Suppliers & what they carry ─────────────────────────────────────────────
insert into suppliers (id, franchise_id, name, lead_time_days) values
  ('d0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'NorCal Produce',   1),
  ('d0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 'Bay Foods Wholesale', 2);

insert into supplier_products (supplier_id, product_id, unit_price, min_order) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 2.20, 5),   -- tomatoes
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 8.00, 1),   -- basil
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 2.05, 10),  -- tomatoes (cheaper, higher min)
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 6.50, 2),   -- mozzarella
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 1.80, 5);   -- penne

-- ── Sales history: ~60 days, weekend-heavy, per branch/menu-item ─────────────
-- Base daily volume per (branch, item), scaled up Fri–Sun. Downtown busiest.
with params as (
  select
    b.id  as branch_id,
    mi.id as menu_item_id,
    -- base servings/day by item popularity
    case mi.name
      when 'Margherita Pizza' then 22
      when 'Marinara Pizza'   then 10
      when 'Pesto Penne'      then 14
      when 'Caprese Salad'    then 9
      when 'Penne Arrabbiata' then 12
    end
    -- branch multiplier
    * case b.name when 'Downtown' then 1.4 when 'Marina' then 1.0 else 0.8 end
      as base
  from branches b cross join menu_items mi
  where b.franchise_id = 'f0000000-0000-0000-0000-000000000001'
),
days as (
  select generate_series(current_date - 60, current_date - 1, interval '1 day')::date as d
)
insert into sales (branch_id, menu_item_id, qty, sold_at)
select
  p.branch_id,
  p.menu_item_id,
  greatest(0, round(
    p.base
    * case when extract(dow from d.d) in (5,6,0) then 1.6 else 1.0 end  -- weekend lift
    * (0.85 + random() * 0.30)                                          -- noise
  ))::int as qty,
  d.d + time '19:00'
from params p cross join days d;

-- refresh cached popularity from the last 30 days
update menu_items mi set popularity = sub.total
from (
  select menu_item_id, sum(qty) as total
  from sales where sold_at >= current_date - 30
  group by menu_item_id
) sub
where sub.menu_item_id = mi.id;

-- ── Inventory: rigged to trigger the demos ──────────────────────────────────
-- Downtown: SHORT on tomatoes (below reorder point) → drives the rebalance/RFQ.
-- Marina:   SURPLUS tomatoes near expiry → offers a transfer to Downtown.
-- Mission:  SURPLUS basil near expiry → drives the "Pesto Night" promotion.
insert into inventory (branch_id, product_id, qty_on_hand, par_level, reorder_point, earliest_expiry) values
  -- Downtown
  ('b0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001',  4.0, 40.0, 12.0, current_date + 4),  -- tomatoes: SHORT
  ('b0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000002', 18.0, 20.0,  6.0, current_date + 9),
  ('b0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000003',  1.2,  2.0,  0.6, current_date + 2),
  ('b0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000004', 40.0, 50.0, 15.0, current_date + 120),
  ('b0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000005', 20.0, 25.0,  8.0, current_date + 300),
  ('b0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000006',  8.0, 10.0,  3.0, current_date + 300),
  -- Marina
  ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001', 34.0, 24.0,  8.0, current_date + 2),   -- tomatoes: SURPLUS near expiry
  ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000002', 14.0, 16.0,  5.0, current_date + 9),
  ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000003',  1.6,  2.0,  0.6, current_date + 2),
  ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000004', 35.0, 45.0, 14.0, current_date + 120),
  ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000005', 18.0, 22.0,  7.0, current_date + 300),
  ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000006',  7.0,  9.0,  3.0, current_date + 300),
  -- Mission
  ('b0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000001', 16.0, 20.0,  6.0, current_date + 5),
  ('b0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000002', 12.0, 14.0,  4.0, current_date + 9),
  ('b0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000003',  3.5,  1.6,  0.5, current_date + 2),   -- basil: SURPLUS near expiry
  ('b0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000004', 30.0, 40.0, 12.0, current_date + 120),
  ('b0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000005', 16.0, 20.0,  6.0, current_date + 300),
  ('b0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000006',  6.0,  8.0,  3.0, current_date + 300);

-- ── A demo consumer with favorites (goal 3) ─────────────────────────────────
insert into consumers (id, display_name) values
  ('e0000000-0000-0000-0000-000000000001', 'Alex');
insert into favorites (consumer_id, menu_item_id) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001'),  -- Margherita
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003');  -- Pesto Penne
