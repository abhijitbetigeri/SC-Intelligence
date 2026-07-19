-- Mise — demand-signal views
--
-- Adds the primitive the planner and the coordinator are both missing: how fast each
-- branch is actually burning each ingredient, and therefore how long the stock lasts.
--
-- Today the only stock signal is `inventory.reorder_point`, which is hand-authored in
-- seed.sql and does not reflect consumption. That produces silent stockouts: Downtown's
-- basil sits at 1.2 kg against a reorder point of 0.6, so nothing fires -- but it burns
-- 1.36 kg/day, i.e. it has 0.88 days of cover against a 1-day minimum supplier lead time.
-- It runs out mid-service and no agent notices, because nothing in the system computes
-- burn.
--
-- Apply after schema.sql (and after seed.sql if you want to query it immediately).

-- ── ingredient burn per branch, from sales x recipe BOM ─────────────────────
-- A 14-day trailing window: long enough to be stable, short enough to track a trend.
create or replace view v_ingredient_burn as
select
  s.branch_id,
  mii.product_id,
  sum(s.qty * mii.qty_per_serving) / 14.0 as daily_burn
from sales s
join menu_item_ingredients mii on mii.menu_item_id = s.menu_item_id
where s.sold_at >= current_date - 14
group by s.branch_id, mii.product_id;

-- ── days of cover, waste risk, and what is safe to give away ────────────────
-- days_of_cover     : how long the shelf lasts at the current burn (NULL when idle)
-- days_to_expiry    : from the nearest lot
-- spoil_qty         : what will NOT be consumed before it expires -> the waste number
-- transferable_qty  : what a branch can give away without hurting itself. This is the
--                     waste-optimal transfer size, and it is larger than "everything
--                     above par". Marina holds 34 kg of tomatoes expiring in 2 days
--                     against a 10.18 kg/day burn: above-par gives 10 kg, but 13.6 kg
--                     will spoil regardless -- so 13.6 kg is the honest offer, and it
--                     both cuts waste and shrinks the PO that Downtown still needs.
create or replace view v_stock_cover as
select
  i.branch_id,
  i.product_id,
  i.qty_on_hand,
  i.par_level,
  i.reorder_point,
  b.daily_burn,
  case when b.daily_burn > 0 then i.qty_on_hand / b.daily_burn end as days_of_cover,
  i.earliest_expiry - current_date                                  as days_to_expiry,
  greatest(0, i.qty_on_hand
              - coalesce(b.daily_burn, 0) * greatest(0, i.earliest_expiry - current_date)
  )                                                                 as spoil_qty,
  greatest(0, i.qty_on_hand
              - coalesce(b.daily_burn, 0) * least(
                  greatest(0, i.earliest_expiry - current_date),
                  7   -- never strip a branch below a week of its own cover
                )
  )                                                                 as transferable_qty
from inventory i
left join v_ingredient_burn b
  on b.branch_id = i.branch_id and b.product_id = i.product_id;

-- ── urgency: what actually needs attention, and by when ─────────────────────
-- `needed_by` is what rfqs.needed_by should be set from. It is currently nullable with
-- nothing computing it, which is why the procurement rule ("lowest landed cost that
-- arrives by needed_by") silently collapses to lowest unit price.
create or replace view v_replenishment_signal as
select
  c.branch_id,
  c.product_id,
  p.name             as product_name,
  p.unit,
  c.qty_on_hand,
  c.daily_burn,
  c.days_of_cover,
  c.days_to_expiry,
  (current_date + floor(coalesce(c.days_of_cover, 999))::int) as needed_by,
  greatest(0, c.par_level - c.qty_on_hand)                    as shortfall_qty,
  case
    when c.days_of_cover is null                        then 'idle'
    when c.days_of_cover <= 1                           then 'critical'
    when c.qty_on_hand   <= c.reorder_point             then 'low'
    when c.days_of_cover <= 2                           then 'low'      -- burn-based catch
    when c.spoil_qty     >  0                           then 'surplus'
    else 'ok'
  end as status
from v_stock_cover c
join products p on p.id = c.product_id;
