// Forecasting + prediction — TRANSPARENT HEURISTICS, not a black box.
//
// Both headline capabilities start here, and both are computed from the sales tickets so the
// UI can always show the numbers behind the call:
//
//   • demand      — moving average × day-of-week shape × supplier lead time
//   • guest order — recency-weighted item affinity from THEIR tickets, venue trends second
//
// A real model (or the InsForge Model Gateway with embeddings) drops in behind the same two
// exported functions. Until then the arithmetic is legible and defensible on stage, which is
// worth more than an opaque prediction.
import { records } from './records.js';
import { allTickets } from './simulate.js';

// Unit pluralisation — naive `unit + 's'` yields "bunchs"/"eachs"; measure abbreviations
// are invariant. Mirrors app/src/lib/units.js so server and client word things identically.
const INVARIANT_UNITS = new Set(['each', 'lb', 'kg', 'L', 'g', 'ml', 'oz']);
const plural = (n, u) =>
  (!u || Number(n) === 1 || INVARIANT_UNITS.has(u)) ? (u || '') : (/(s|x|z|ch|sh)$/.test(u) ? `${u}es` : `${u}s`);

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const DAY = 86400000;
const daysAgo = (dateStr) => Math.max(0, Math.round((Date.now() - new Date(`${dateStr}T12:00:00Z`).getTime()) / DAY));

// ── demand ───────────────────────────────────────────────────────────────────

// Units sold per SKU per day, plus the day-of-week shape. One pass over the tickets.
let _demandCache = null;
export function demandIndex() {
  if (_demandCache) return _demandCache;
  const bySku = new Map();
  for (const t of allTickets()) {
    for (const l of t.lines) {
      let e = bySku.get(l.sku);
      if (!e) { e = { total: 0, days: new Map(), dow: Array.from({ length: 7 }, () => ({ units: 0, n: 0 })) }; bySku.set(l.sku, e); }
      e.total += l.qty;
      e.days.set(t.date, (e.days.get(t.date) || 0) + l.qty);
      e.dow[t.dow].units += l.qty;
    }
  }
  // count each observed date once per day-of-week so the factor is an average, not a sum
  const dates = [...new Set(allTickets().map((t) => t.date))];
  for (const e of bySku.values()) {
    for (const d of dates) {
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
      e.dow[dow].n += 1;
    }
    e.observedDays = dates.length;
  }
  _demandCache = bySku;
  return bySku;
}

// Rolling daily average over the last `window` days (defaults to a fortnight).
export function dailyDemand(sku, window = 14) {
  const e = demandIndex().get(sku);
  if (!e) return { avg: 0, sold: 0, window, dowFactor: Array(7).fill(1) };
  let sold = 0;
  for (const [date, units] of e.days) if (daysAgo(date) <= window) sold += units;
  const avg = sold / window;
  const overall = e.total / Math.max(1, e.observedDays);
  const dowFactor = e.dow.map((d) => (d.n && overall ? clamp((d.units / d.n) / overall, 0.4, 2.4) : 1));
  return { avg: round2(avg), sold, window, dowFactor, overall: round2(overall) };
}

// Expected units consumed over the supplier's lead time (+ a safety buffer), shaped by which
// days of the week actually fall inside that window. This is the number the PO is sized on.
export function forecastOverLeadTime(sku, leadTimeDays, safetyDays = 2) {
  const { avg, sold, window, dowFactor, overall } = dailyDemand(sku);
  const horizon = leadTimeDays + safetyDays;
  let expected = 0;
  const d = new Date();
  for (let i = 1; i <= horizon; i++) {
    const day = new Date(d.getTime() + i * DAY);
    expected += avg * dowFactor[day.getDay()];
  }
  return {
    expected: round1(expected),
    horizon,
    leadTimeDays,
    safetyDays,
    dailyAvg: avg,
    soldInWindow: sold,
    window,
    overallAvg: overall,
    // the sentence the UI prints under the number
    basis: `${sold} sold in the last ${window} days (${avg}/day); ${horizon}-day window covers lead time ${leadTimeDays}d + ${safetyDays}d buffer`,
  };
}

// Rank supplier options: cheap, fast and reliable — but FEASIBILITY comes first.
//
// A supplier whose lead time exceeds the stock we have left cannot solve the problem no
// matter how cheap it is: the item is 86'd before the truck arrives. So options are split
// into feasible (arrives before we run out) and infeasible, and no infeasible option ever
// outranks a feasible one. Within each group the cost/lead/reliability score decides.
//
// Returns every option scored, so the UI can show why the winner won — and so the sourcing
// insight can surface a cheaper-but-too-slow option as a real trade rather than hiding it.
export function rankSuppliers(item) {
  const opts = item.supplierOptions || [];
  if (!opts.length) return [];
  const costs = opts.map((o) => o.unitCost);
  const leads = opts.map((o) => o.leadTimeDays);
  const spanC = Math.max(...costs) - Math.min(...costs) || 1;
  const spanL = Math.max(...leads) - Math.min(...leads) || 1;
  const { avg } = dailyDemand(item.sku);
  const cover = avg > 0 ? (item.onHand || 0) / avg : Infinity; // days until we run out

  return opts
    .map((o) => {
      const costScore = 1 - (o.unitCost - Math.min(...costs)) / spanC;      // 1 = cheapest
      const leadScore = 1 - (o.leadTimeDays - Math.min(...leads)) / spanL;  // 1 = fastest
      const score = 0.45 * costScore + 0.30 * leadScore + 0.25 * o.reliability;
      const feasible = o.leadTimeDays <= cover;
      return {
        ...o,
        costScore: round2(costScore), leadScore: round2(leadScore), score: round2(score),
        feasible,
        note: feasible ? null : `arrives in ${o.leadTimeDays}d — ${round1(cover)}d of stock left`,
      };
    })
    .sort((a, b) => (b.feasible - a.feasible) || (b.score - a.score));
}

// Size the order: cover the forecast, refill to par, respect MOQ, round to whole units.
export function suggestQty(item, expected, moq) {
  const gap = Math.max(0, item.par - (item.onHand || 0) - (item.onOrder || 0));
  const needed = Math.max(gap, Math.ceil(expected - (item.onHand || 0)));
  const qty = Math.max(needed, moq || 1, 1);
  const reasons = [];
  if (qty === moq && moq > needed) reasons.push(`rounded up to the supplier minimum of ${moq}`);
  if (gap >= needed && gap > 0) reasons.push(`refills to par (${item.par} ${plural(item.par, item.unit)})`);
  else reasons.push(`covers forecast demand of ${expected}`);
  return { qty, gap, needed, reasons };
}

// The full draft: what to buy, from whom, how much, and every number behind it.
// This is what the reorder-decisioner agent will return once it runs on Runtype — the shape
// stays identical, so the UI does not change when the driver does.
export function draftReorder(item) {
  const ranked = rankSuppliers(item);
  const best = ranked[0];
  if (!best) return null;
  const fc = forecastOverLeadTime(item.sku, best.leadTimeDays);
  const { qty, reasons } = suggestQty(item, fc.expected, best.moq);
  const runnerUp = ranked[1];
  // Describe the runner-up by why it ACTUALLY lost. Claiming "cheaper" about a pricier
  // option is the sort of confident wrong sentence that destroys trust in the whole draft.
  let comparison;
  if (!runnerUp) {
    comparison = 'only supplier carrying this item';
  } else if (runnerUp.unitCost < best.unitCost) {
    comparison = runnerUp.feasible
      ? `${runnerUp.supplierName} is cheaper at $${runnerUp.unitCost} but slower (${runnerUp.leadTimeDays}d) and ${Math.round(runnerUp.reliability * 100)}% on-time`
      : `${runnerUp.supplierName} is cheaper at $${runnerUp.unitCost} but ${runnerUp.note}`;
  } else {
    comparison = `beat ${runnerUp.supplierName} ($${runnerUp.unitCost}, ${runnerUp.leadTimeDays}d, ${Math.round(runnerUp.reliability * 100)}% on-time)`;
  }

  // When NOTHING can arrive in time, say so instead of implying the order fixes the problem.
  const late = !best.feasible;
  const why = [
    `${best.supplierName} — $${best.unitCost}/${item.unit}, ${best.leadTimeDays}-day lead, ${Math.round(best.reliability * 100)}% on-time${late ? ' (fastest available)' : ''}`,
    comparison,
    ...reasons,
  ];
  return {
    sku: item.sku,
    itemName: item.name,
    unit: item.unit,
    supplierId: best.supplierId,
    supplier: best.supplierName,
    supplierCode: best.supplierCode,
    leadTimeDays: best.leadTimeDays,
    qty,
    unitCost: best.unitCost,
    total: round2(qty * best.unitCost),
    currency: 'USD',
    forecast: fc,
    ranked,
    why,
    // true when even the fastest supplier arrives after the shelf empties — the operator
    // needs to plan a substitute, not just approve the order.
    late,
    lateNote: late
      ? `Even ${best.supplierName}'s ${best.leadTimeDays}-day lead lands after the ${round1(avgCover(item))} days of stock left. Plan a substitute for the gap.`
      : null,
  };
}

// Days of stock remaining at the current burn rate.
function avgCover(item) {
  const { avg } = dailyDemand(item.sku);
  return avg > 0 ? (item.onHand || 0) / avg : Infinity;
}

// ── stock board ──────────────────────────────────────────────────────────────

// Everything the Stock board needs, with the criticality math attached to each row.
// daysOfCover is the honest alarm: on-hand ÷ daily burn, compared against the lead time.
export function stockBoard() {
  const items = records.list('item');
  const rows = items.map((it) => {
    const ranked = rankSuppliers(it);
    const lead = ranked[0]?.leadTimeDays ?? 3;
    const { avg } = dailyDemand(it.sku);
    const daysOfCover = avg > 0 ? round1((it.onHand || 0) / avg) : null;
    const pctOfPar = it.par ? Math.round(((it.onHand || 0) / it.par) * 100) : 100;
    // "critical" = will run out before a replenishment could land.
    const critical = daysOfCover !== null && daysOfCover <= lead;
    const low = (it.onHand || 0) <= it.reorderPoint;
    return {
      id: it.id, sku: it.sku, name: it.name, category: it.category, unit: it.unit,
      onHand: it.onHand, onOrder: it.onOrder || 0, par: it.par, reorderPoint: it.reorderPoint,
      unitCost: it.unitCost, pctOfPar, dailyAvg: avg, daysOfCover, leadTimeDays: lead,
      status: critical ? 'critical' : low ? 'low' : 'ok',
      supplier: ranked[0]?.supplierName || null,
    };
  });
  const order = { critical: 0, low: 1, ok: 2 };
  rows.sort((a, b) => order[a.status] - order[b.status] || a.pctOfPar - b.pctOfPar);
  return {
    rows,
    counts: {
      critical: rows.filter((r) => r.status === 'critical').length,
      low: rows.filter((r) => r.status === 'low').length,
      ok: rows.filter((r) => r.status === 'ok').length,
    },
    stockValue: round2(rows.reduce((s, r) => s + r.onHand * r.unitCost, 0)),
  };
}

// ── guest prediction ─────────────────────────────────────────────────────────

// Recency-weighted affinity from a guest's OWN tickets. Weight halves roughly every 6 weeks,
// so a taste that has moved on stops dominating the prediction.
const recencyWeight = (d) => Math.exp(-d / 60);
// "today" / "1 day ago" / "12 days ago" — never "1 days ago"
const days = (d) => (d === 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`);

export function predictForGuest(guest) {
  const mine = allTickets().filter((t) => t.guestKey === guest.key);
  const itemsByName = new Map(records.list('item').map((i) => [i.sku, i]));

  const score = new Map();
  let lastVisit = null;
  for (const t of mine) {
    const d = daysAgo(t.date);
    if (lastVisit === null || d < lastVisit) lastVisit = d;
    const w = recencyWeight(d);
    for (const l of t.lines) {
      const cur = score.get(l.sku) || { sku: l.sku, weighted: 0, times: 0, units: 0, lastDays: d };
      cur.weighted += w * l.qty;
      cur.times += 1;
      cur.units += l.qty;
      cur.lastDays = Math.min(cur.lastDays, d);
      score.set(l.sku, cur);
    }
  }

  // Confidence blends HOW OFTEN they order it with HOW RECENTLY. Pure recency weighting
  // produces the nonsense of an item ordered on 18 of 22 visits ranking below one ordered on
  // 16 — technically defensible, but it reads as a bug and destroys trust in the number.
  const topWeighted = Math.max(...[...score.values()].map((s) => s.weighted), 1);
  for (const s of score.values()) {
    const frequency = mine.length ? s.times / mine.length : 0;   // 0..1
    const recency = s.weighted / topWeighted;                    // 0..1
    s.blend = 0.55 * frequency + 0.45 * recency;
  }

  const ranked = [...score.values()].sort((a, b) => b.blend - a.blend);
  const top = ranked[0]?.blend || 1;
  const grounding = mine.length >= 3 ? 'their tickets' : 'venue trends (too few visits on file)';

  // Fall back to venue-wide popularity only when we genuinely lack history — and SAY SO.
  const source = mine.length >= 3
    ? ranked
    : records.list('item').map((i) => ({ sku: i.sku, blend: dailyDemand(i.sku).avg, times: 0, units: 0, lastDays: null }))
        .sort((a, b) => b.blend - a.blend);

  const denominator = mine.length >= 3 ? top : (source[0]?.blend || 1);

  const likely = source.slice(0, 3).map((s) => {
    const item = itemsByName.get(s.sku);
    return {
      sku: s.sku,
      name: item?.name || s.sku,
      category: item?.category,
      // a share of their strongest affinity, capped — a heuristic never claims 99%
      confidence: clamp(Math.round((s.blend / denominator) * 88), 18, 88),
      seen: s.times
        ? `ordered on ${s.times} of their last ${mine.length} visits${s.lastDays !== null ? ` · last ${days(s.lastDays)}` : ''}`
        : 'venue favourite — no personal history yet',
      inStock: (item?.onHand || 0) > 0,
    };
  });

  // A grounded suggestion: something in stock they have NOT ordered. Biased toward wine and
  // higher-ticket plates — a server can actually offer those. Suggesting a garnish herb is
  // technically a gap in their history and useless on the floor.
  const triedSkus = new Set(score.keys());
  const likedCategories = new Set(likely.map((l) => l.category));
  const sellable = (i) => i.category === 'wine' || i.unitCost >= 20;
  const candidates = records.list('item')
    .filter((i) => !triedSkus.has(i.sku) && (i.onHand || 0) > 0 && sellable(i));
  const suggestion =
    // first choice: sellable, in a category they already order
    candidates.filter((i) => likedCategories.has(i.category))
      .sort((a, b) => dailyDemand(b.sku).avg - dailyDemand(a.sku).avg)[0]
    // otherwise: the venue's best-moving sellable item they haven't had
    || candidates.sort((a, b) => dailyDemand(b.sku).avg - dailyDemand(a.sku).avg)[0]
    || null;

  const first = likely[0];
  const scriptBits = [];
  if (first) scriptBits.push(`${guest.name} usually starts with the ${first.name}`);
  if (suggestion) scriptBits.push(`hasn't tried the ${suggestion.name} — worth offering`);
  if (guest.allergies?.length) scriptBits.push(guest.allergies.join('; '));

  return {
    guestId: guest.id,
    key: guest.key,
    name: guest.name,
    tier: guest.tier,
    avgCheck: guest.avgCheck,
    allergies: guest.allergies || [],
    notes: guest.notes,
    reservation: guest.reservation,
    visits: mine.length,
    lastVisitDays: lastVisit,
    grounding,
    likely,
    suggestion: suggestion ? { sku: suggestion.sku, name: suggestion.name } : null,
    script: scriptBits.join(' · '),
  };
}

// Tonight's book — everyone with a reservation, VIPs first.
export function tonightsGuests() {
  const rank = { VIP: 0, Regular: 1, Lapsing: 2 };
  return records.list('guest')
    .filter((g) => g.reservation)
    .map(predictForGuest)
    .sort((a, b) => (rank[a.tier] ?? 3) - (rank[b.tier] ?? 3) || String(a.reservation.time).localeCompare(b.reservation.time));
}

// Everyone, for the wider guest list (lapsing included).
export const allGuestPredictions = () => records.list('guest').map(predictForGuest);
