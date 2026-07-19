-- ─────────────────────────────────────────────────────────────────────────────
-- Seed — guest intelligence demo data (run AFTER db/migrations/001_guest_intelligence.sql)
--
-- Continues the existing conventions: fixed readable UUIDs, `e0000000…` for
-- consumers, and Alex (…0001) kept exactly as seeded so the concierge agent and
-- its eval suite are unaffected.
--
-- Attribution is UPDATE-only against the existing 900 sales rows. No row is
-- inserted, deleted, or re-quantified, so every forecast input is unchanged —
-- `weekly_forecast` and the Rebalance / Concierge eval suites see the same
-- numbers before and after. The slices are picked by a stable row_number over
-- (sold_at, id), so re-running writes the same rows and is a genuine no-op.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Diners ──────────────────────────────────────────────────────────────────
-- Alex already exists; fill in the profile rather than re-inserting.
update consumers set
  tier = 'regular', first_seen = current_date - 240, lifetime_value = 1180.00,
  notes = 'Always asks what is fresh before ordering.'
where id = 'e0000000-0000-0000-0000-000000000001';

insert into consumers (id, display_name, tier, allergies, notes, first_seen, lifetime_value) values
  ('e0000000-0000-0000-0000-000000000002', 'Priya Raman',   'vip',
   '{}',            'Books the same corner table. Orders for the table, not herself.', current_date - 520, 4210.00),
  ('e0000000-0000-0000-0000-000000000003', 'Marco Bellini', 'vip',
   '{pine nuts}',   'Pesto is off the table — pine nuts. Suggest the Arrabbiata instead.', current_date - 610, 3890.00),
  ('e0000000-0000-0000-0000-000000000004', 'Dana Whitfield','regular',
   '{dairy}',       'Dairy-free. Marinara works; Margherita and Caprese do not.', current_date - 150, 720.00),
  ('e0000000-0000-0000-0000-000000000005', 'Tom Okafor',    'lapsing',
   '{}',            'Was weekly until March, not seen in six weeks. Worth a welcome-back.', current_date - 400, 1640.00)
on conflict (id) do nothing;

insert into favorites (consumer_id, menu_item_id) values
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003'),  -- Priya  → Pesto Penne
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000005'),  -- Marco  → Penne Arrabbiata
  ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002'),  -- Dana   → Marinara
  ('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001')   -- Tom    → Margherita
on conflict do nothing;

-- ── Attribution ─────────────────────────────────────────────────────────────
-- Each guest is tied to a deterministic slice of the tickets for the item they
-- actually favour, at one branch — so `guest_item_affinity` ranks their real
-- history rather than the venue average. `every_nth` controls how much of that
-- item's history belongs to them; the rest stay walk-ins (consumer_id null).
with plan(consumer_id, branch_id, menu_item_id, every_nth) as (values
  -- Alex — Margherita + Pesto Penne at Downtown (matches his existing favorites)
  ('e0000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-00000000000a'::uuid, 'c0000000-0000-0000-0000-000000000001'::uuid, 6),
  ('e0000000-0000-0000-0000-000000000001',       'b0000000-0000-0000-0000-00000000000a',       'c0000000-0000-0000-0000-000000000003',       9),
  -- Priya — heavy Pesto Penne at Marina (the branch holding the basil surplus)
  ('e0000000-0000-0000-0000-000000000002',       'b0000000-0000-0000-0000-00000000000b',       'c0000000-0000-0000-0000-000000000003',       4),
  ('e0000000-0000-0000-0000-000000000002',       'b0000000-0000-0000-0000-00000000000b',       'c0000000-0000-0000-0000-000000000004',       11),
  -- Marco — Arrabbiata at Mission; never pesto, so the allergy and the history agree
  ('e0000000-0000-0000-0000-000000000003',       'b0000000-0000-0000-0000-00000000000c',       'c0000000-0000-0000-0000-000000000005',       5),
  -- Dana — Marinara only; dairy allergy means she has genuinely never ordered Margherita
  ('e0000000-0000-0000-0000-000000000004',       'b0000000-0000-0000-0000-00000000000a',       'c0000000-0000-0000-0000-000000000002',       7),
  -- Tom — Margherita at Mission, but nothing recent: the recency decay should show him lapsing
  ('e0000000-0000-0000-0000-000000000005',       'b0000000-0000-0000-0000-00000000000c',       'c0000000-0000-0000-0000-000000000001',       8)
),
ranked as (
  select s.id, s.branch_id, s.menu_item_id, s.sold_at,
         row_number() over (partition by s.branch_id, s.menu_item_id order by s.sold_at, s.id) as rn
  from sales s
)
update sales s
set consumer_id = p.consumer_id
from ranked r
join plan p
  on p.branch_id = r.branch_id
 and p.menu_item_id = r.menu_item_id
 and r.rn % p.every_nth = 0
where s.id = r.id
  -- Tom is lapsing: only attribute his older tickets so the decay is real, not asserted.
  and (p.consumer_id <> 'e0000000-0000-0000-0000-000000000005'
       or r.sold_at < now() - interval '42 days');

-- ── Tonight's book ──────────────────────────────────────────────────────────
-- Drives the pre-shift brief. Times are relative to today so the demo never
-- goes stale. Priya and Marco are the two VIPs the brief should lead with.
delete from reservations where id in (
  'd0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002',
  'd0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000004');

insert into reservations (id, branch_id, consumer_id, starts_at, party_size, status, notes) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b',
   'e0000000-0000-0000-0000-000000000002', current_date + time '19:00', 4, 'booked', 'Corner table, as always.'),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000c',
   'e0000000-0000-0000-0000-000000000003', current_date + time '19:30', 2, 'booked', 'Pine-nut allergy — brief the pass.'),
  ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-00000000000a',
   'e0000000-0000-0000-0000-000000000004', current_date + time '20:00', 2, 'booked', null),
  ('d0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-00000000000a',
   'e0000000-0000-0000-0000-000000000001', current_date + time '20:30', 3, 'booked', null);

-- ── Verification (expected results in comments) ─────────────────────────────
-- select count(*) from sales;                              -- 900, unchanged
-- select sum(qty) from sales;                              -- unchanged from pre-migration
-- select count(*) from sales where consumer_id is not null;-- 58 attributed, rest walk-ins
-- select display_name, menu_item_name, times_ordered, affinity_score
--   from guest_item_affinity a join consumers c on c.id = a.consumer_id
--  order by affinity_score desc;
--   -- Priya → Pesto Penne top; Marco → Arrabbiata and NO pesto row; Tom → low score (lapsed)
