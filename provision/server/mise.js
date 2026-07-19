// Mise franchise view — the owner dashboard for the team's multi-branch agent layer.
//
// The Mise agent layer (runtype/BUILD.md in BrandonKNguyen192-team repo SC-Intelligence) runs
// four capabilities on Runtype and persists its work to Runtype's native record store:
//
//   catalog/trattoria-verde   branches, products, menu items + BOM, suppliers
//   branch-state/{branch}     inventory rows, sales_avg_daily, weekend_lift
//   forecast/latest           written by the weekly_forecast flow
//   transfer/* · po/*         written by the rebalance_and_procure agent (the showpiece)
//   promotion/latest          written by the promotion_sweep flow
//
// Its architecture lists a "Web dashboard (Owner)" surface — forecast/planner results,
// rebalance + PO approval cards, live inventory — which does not exist yet. This is that
// surface, READ-ONLY: it renders what the agents decided. It never writes, so it cannot
// conflict with the agent layer or with anyone else's branch.
//
//   MISE_RUNTYPE_TOKEN unset (default) → the bundled fixture, shaped exactly like the
//                                        documented records. Renders offline, always.
//   MISE_RUNTYPE_TOKEN set             → live records from the Runtype API.
//
// The dashboard also layers OUR analysis on top of their output: days of cover per product,
// and whether a proposed purchase order can actually arrive before the shelf empties. Their
// agent decides; this view shows the arithmetic behind the decision — including when the
// decision cannot solve the problem.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logSeam } from './seams.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

export const miseConfigured = () => Boolean(process.env.MISE_RUNTYPE_TOKEN);
export const miseMode = () => (miseConfigured() ? 'runtype' : 'fixture');

// ── record source ────────────────────────────────────────────────────────────
function fixtureRecords() {
  const raw = fs.readFileSync(path.join(HERE, 'fixtures', 'mise-records.json'), 'utf8');
  return JSON.parse(raw);
}

async function liveRecords() {
  const token = process.env.MISE_RUNTYPE_TOKEN;
  const base = process.env.MISE_RUNTYPE_URL || 'https://api.runtype.com/v1';
  const out = [];
  // One request per record type we care about — the list endpoint returns a truncated
  // metadata preview for broad queries, so keep the type filter tight.
  for (const type of ['catalog', 'branch-state', 'forecast', 'transfer', 'po', 'promotion']) {
    const r = await fetch(`${base}/records?type=${encodeURIComponent(type)}&limit=50`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`runtype records ${type}: HTTP ${r.status}`);
    const body = await r.json();
    out.push(...(body.data || []));
  }
  return out;
}

// ── analysis layered on top of their records ─────────────────────────────────
// Days of cover is the primitive the agent layer is missing: on-hand ÷ daily burn, compared
// against the supplier lead time. A hand-authored reorder point does not reflect consumption,
// so an item can sit above it and still run out mid-service.
function analyseBranch(branch, suppliersByProduct) {
  const rows = (branch.inventory || []).map((it) => {
    const burn = it.daily_burn ?? 0;
    const cover = burn > 0 ? it.on_hand / burn : null;
    const lead = suppliersByProduct[it.sku]?.[0]?.lead_time_days ?? null;
    // spoilage: what will NOT be consumed before the nearest lot expires
    const spoil = Math.max(0, it.on_hand - burn * (it.earliest_expiry_days ?? 999));
    const status = cover === null ? 'idle'
      : cover <= 1 ? 'critical'
      : (lead !== null && cover <= lead) ? 'critical'
      : spoil > 0 ? 'surplus'
      : it.on_hand <= it.reorder ? 'low'
      : cover <= 2 ? 'low'
      : 'ok';
    return {
      sku: it.sku, name: it.name, unit: it.unit,
      onHand: it.on_hand, par: it.par, reorder: it.reorder,
      dailyBurn: round2(burn),
      daysOfCover: cover === null ? null : round1(cover),
      daysToExpiry: it.earliest_expiry_days ?? null,
      spoilQty: round1(spoil),
      leadTimeDays: lead,
      status,
      // the blind spot worth showing: above its reorder point, yet under a day of cover
      silentStockout: status === 'critical' && it.on_hand > it.reorder,
    };
  });
  return { id: branch.id, name: branch.name, city: branch.city, rows };
}

// Can the proposed purchase actually arrive before that branch runs out?
function assessPurchase(po, branches, suppliersByProduct) {
  const dest = branches.find((b) => b.id === po.to_branch);
  const row = dest?.rows.find((r) => r.sku === po.sku);
  const options = suppliersByProduct[po.sku] || [];
  const chosen = options.find((s) => s.name === po.supplier) || options[0] || null;
  const cover = row?.daysOfCover ?? null;
  const eta = chosen?.lead_time_days ?? po.eta_days ?? null;
  const late = cover !== null && eta !== null && eta > cover;
  // the cheaper option that was passed over, if any
  const cheapest = [...options].sort((a, b) => a.unit_price - b.unit_price)[0] || null;
  const fastest = [...options].sort((a, b) => a.lead_time_days - b.lead_time_days)[0] || null;
  return {
    ...po,
    branchName: dest?.name || po.to_branch,
    daysOfCover: cover,
    etaDays: eta,
    late,
    lateNote: late
      ? `Arrives in ${eta}d against ${cover}d of stock — the shelf is empty for about `
        + `${round1(eta - cover)} days regardless. Plan a substitute for the gap.`
      : null,
    // If a faster supplier exists and was not chosen, the gap is self-inflicted.
    fasterAvailable: fastest && chosen && fastest.name !== chosen.name && fastest.lead_time_days < eta
      ? { name: fastest.name, leadTimeDays: fastest.lead_time_days, unitPrice: fastest.unit_price,
          costDelta: round2((fastest.unit_price - chosen.unit_price) * po.qty),
          daysSaved: round1(eta - fastest.lead_time_days) }
      : null,
    cheapest: cheapest ? { name: cheapest.name, unitPrice: cheapest.unit_price } : null,
    options,
  };
}

// ── snapshot ─────────────────────────────────────────────────────────────────
export async function franchiseSnapshot() {
  let records;
  let mode = 'fixture';
  if (miseConfigured()) {
    try {
      records = await liveRecords();
      mode = 'runtype';
    } catch (e) {
      logSeam('mise', `live records failed (${e.message}) — using fixture`);
    }
  }
  if (!records) records = fixtureRecords();

  const byType = (t) => records.filter((r) => r.type === t).map((r) => r.metadata);
  const catalog = byType('catalog')[0] || {};
  const suppliersByProduct = {};
  for (const s of catalog.suppliers || []) {
    for (const p of s.products || []) {
      (suppliersByProduct[p.sku] ||= []).push({
        name: s.name, lead_time_days: s.lead_time_days,
        unit_price: p.unit_price, min_order: p.min_order,
      });
    }
  }

  const branches = byType('branch-state').map((b) => analyseBranch(b, suppliersByProduct));
  const transfers = byType('transfer');
  const purchases = byType('po').map((p) => assessPurchase(p, branches, suppliersByProduct));
  const promotions = byType('promotion').flatMap((p) => p.promotions || []);
  const forecast = byType('forecast')[0] || null;

  // Waste avoided by the proposed transfers — the number that makes the rebalance thesis
  // concrete rather than a claim.
  const wasteAvoided = transfers.reduce((sum, t) => {
    const from = branches.find((b) => b.id === t.from_branch);
    const row = from?.rows.find((r) => r.sku === t.sku);
    return sum + Math.min(t.qty, row?.spoilQty ?? 0);
  }, 0);

  // Does a transfer beat every supplier on time? That is the thesis, stated as arithmetic.
  const transferCases = transfers.map((t) => {
    const to = branches.find((b) => b.id === t.to_branch);
    const row = to?.rows.find((r) => r.sku === t.sku);
    const fastestLead = Math.min(...(suppliersByProduct[t.sku] || [{ lead_time_days: 99 }])
      .map((s) => s.lead_time_days));
    const coverAfter = row && row.dailyBurn > 0
      ? round1((row.onHand + t.qty) / row.dailyBurn) : null;
    return {
      ...t,
      fromName: branches.find((b) => b.id === t.from_branch)?.name || t.from_branch,
      toName: to?.name || t.to_branch,
      coverBefore: row?.daysOfCover ?? null,
      coverAfter,
      fastestSupplierLead: fastestLead,
      // same-day transfer vs the fastest supplier: the comparison worth saying out loud
      beatsEverySupplier: coverAfter !== null && fastestLead > 0,
    };
  });

  const critical = branches.flatMap((b) => b.rows.filter((r) => r.status === 'critical'));
  const silent = branches.flatMap((b) => b.rows.filter((r) => r.silentStockout));

  return {
    mode,
    franchise: catalog.franchise || 'Trattoria Verde',
    branches,
    transfers: transferCases,
    purchases,
    promotions,
    forecast,
    totals: {
      branches: branches.length,
      critical: critical.length,
      silentStockouts: silent.length,
      transfers: transferCases.length,
      purchases: purchases.length,
      latePurchases: purchases.filter((p) => p.late).length,
      wasteAvoidedKg: round1(wasteAvoided),
      purchaseTotal: round2(purchases.reduce((s, p) => s + (p.total || 0), 0)),
    },
  };
}
