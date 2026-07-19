-- Rebuild-to-spec (runtype/agents.md): get_stock_signal needs spoil_qty/transferable_qty,
-- and post_shortage/post_surplus need somewhere to write.

-- v_replenishment_signal was missing spoil_qty/transferable_qty even though v_stock_cover
-- (which it's built on) already computes them. CREATE OR REPLACE can only APPEND columns,
-- not insert mid-list (hit "cannot change name of view column" applying this), so this
-- drops and recreates instead, same as the prior menu_item_availability migration.
drop view if exists v_replenishment_signal;
create view v_replenishment_signal as
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
  end as status,
  c.spoil_qty,
  c.transferable_qty
from v_stock_cover c
join products p on p.id = c.product_id;

-- The audit row behind post_shortage/post_surplus.
create table if not exists stock_alerts (
  id           uuid primary key default uuid_generate_v4(),
  franchise_id uuid not null references franchises(id) on delete cascade,
  branch_id    uuid not null references branches(id) on delete cascade,
  product_id   uuid not null references products(id) on delete cascade,
  kind         text not null check (kind in ('shortage', 'surplus')),
  qty          numeric(12,3) not null,
  needed_by    date,
  status       text not null default 'open',
  created_at   timestamptz not null default now()
);
create index if not exists stock_alerts_franchise_branch_kind_status_idx
  on stock_alerts (franchise_id, branch_id, kind, status);
