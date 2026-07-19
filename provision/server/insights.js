// Insight feed — computed from the live records, never hand-written copy.
//
// Each insight carries the numbers it was derived from and a CTA that routes into the view
// where the operator can act on it. Severity is the alert axis (red = act now); `kind` is
// what sort of finding it is. An insight is only shown if its math actually fires.
import { records } from './records.js';
import { stockBoard, dailyDemand, tonightsGuests, rankSuppliers } from './forecast.js';

const money = (n) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export function computeInsights() {
  const out = [];
  const board = stockBoard();
  const items = records.list('item');

  // 1. Critical stock — will run out before a delivery could land.
  const critical = board.rows.filter((r) => r.status === 'critical');
  if (critical.length) {
    const worst = critical[0];
    out.push({
      kind: 'risk', severity: 'red', view: 'stock',
      label: 'Stock risk',
      title: `${critical.length} item${critical.length === 1 ? '' : 's'} will run out before resupply`,
      body: `${worst.name} has ${worst.onHand} ${worst.unit}${worst.onHand === 1 ? '' : 's'} left — ${worst.daysOfCover} days of cover against a ${worst.leadTimeDays}-day lead time from ${worst.supplier}.`,
      impact: `${critical.length} draft PO${critical.length === 1 ? '' : 's'} ready for approval`,
      cta: 'Open the stock board',
    });
  }

  // 2. Cash sitting still — slow movers well above par.
  const dead = board.rows
    .filter((r) => r.dailyAvg < 0.35 && r.onHand > r.reorderPoint)
    .map((r) => ({ ...r, tied: r.onHand * r.unitCost }))
    .sort((a, b) => b.tied - a.tied);
  if (dead.length) {
    const tied = dead.reduce((s, r) => s + r.tied, 0);
    out.push({
      kind: 'leak', severity: 'yellow', view: 'stock',
      label: 'Dead stock',
      title: `${money(tied)} sitting in slow-moving stock`,
      body: `${dead.length} items are moving under 0.35 units a day while held above their reorder point. ${dead[0].name} alone accounts for ${money(dead[0].tied)}.`,
      impact: `${money(tied)} of working capital`,
      cta: 'Review slow movers',
    });
  }

  // 3. Sourcing tension — the supplier we'd pick (cost × lead × reliability) is not the
  // cheapest one. Worth surfacing as a real trade: cash saved against days of lead time.
  for (const it of items) {
    const opts = it.supplierOptions || [];
    if (opts.length < 2) continue;
    const chosen = rankSuppliers(it)[0];
    const cheapest = [...opts].sort((a, b) => a.unitCost - b.unitCost)[0];
    if (!chosen || cheapest.supplierCode === chosen.supplierCode) continue;
    const { avg } = dailyDemand(it.sku);
    const annualSaving = (chosen.unitCost - cheapest.unitCost) * avg * 365;
    if (annualSaving < 200) continue;
    const extraDays = cheapest.leadTimeDays - chosen.leadTimeDays;
    out.push({
      kind: 'gem', severity: 'green', view: 'stock',
      label: 'Sourcing',
      title: `${cheapest.supplierName} is cheaper on ${it.name}`,
      body: `$${cheapest.unitCost} vs $${chosen.unitCost} per ${it.unit} at ${avg} ${it.unit}s a day — but ${extraDays > 0 ? `${extraDays} days slower to deliver` : 'less reliable'}. Worth it only if you carry more buffer.`,
      impact: `${money(annualSaving)}/yr if the volume holds`,
      cta: 'Compare suppliers',
    });
    break; // one sourcing insight is enough for the feed
  }

  // 4. Tonight's book — a VIP with a clear prediction.
  const tonight = tonightsGuests();
  const vip = tonight.find((g) => g.tier === 'VIP' && g.likely.length);
  if (vip) {
    out.push({
      kind: 'gem', severity: 'green', view: 'vips',
      label: 'Tonight',
      title: `${vip.name} is booked for ${vip.reservation.time}`,
      body: `${vip.visits} visits on file. Most likely order: ${vip.likely[0].name} (${vip.likely[0].confidence}% confidence)${vip.suggestion ? `. Hasn't tried the ${vip.suggestion.name}.` : ''}`,
      impact: `${tonight.length} profiled guests tonight`,
      cta: "Open tonight's brief",
    });
  }

  // 5. A prediction that collides with stock — the two halves of the product meeting.
  for (const g of tonight) {
    const want = g.likely.find((l) => !l.inStock);
    if (!want) continue;
    out.push({
      kind: 'risk', severity: 'red', view: 'vips',
      label: 'Collision',
      title: `${g.name} usually orders ${want.name} — it is out of stock`,
      body: `${g.reservation.time} tonight, party of ${g.reservation.party}. ${want.seen}. Brief the floor on a substitute before service.`,
      impact: `${g.tier} guest · ${money(g.avgCheck)} average check`,
      cta: 'Open the guest card',
    });
    break;
  }

  // 6. Approvals waiting.
  const drafts = records.list('po').filter((p) => p.stage === 'draft');
  if (drafts.length) {
    out.push({
      kind: 'risk', severity: 'yellow', view: 'stock',
      label: 'Approvals',
      title: `${drafts.length} purchase order${drafts.length === 1 ? '' : 's'} waiting on you`,
      body: `Drafted and priced, nothing sent. Total ${money(drafts.reduce((s, p) => s + (p.total || 0), 0))} across ${new Set(drafts.map((p) => p.supplier)).size} supplier(s).`,
      impact: 'Approve to dispatch',
      cta: 'Review drafts',
    });
  }

  const sev = { red: 0, yellow: 1, green: 2 };
  return out.sort((a, b) => sev[a.severity] - sev[b.severity]);
}

// The overview KPI strip — every number traceable to a record.
export function overviewKpis() {
  const board = stockBoard();
  const pos = records.list('po');
  const tonight = tonightsGuests();
  return [
    { label: 'Critical items', value: board.counts.critical, tone: board.counts.critical ? 'down' : 'flat', note: 'below lead-time cover' },
    { label: 'Below par', value: board.counts.low, tone: 'flat', note: 'at or under reorder point' },
    { label: 'Stock on hand', value: `$${Math.round(board.stockValue).toLocaleString('en-US')}`, tone: 'flat', note: `${board.rows.length} tracked items` },
    { label: 'Awaiting approval', value: pos.filter((p) => p.stage === 'draft').length, tone: 'flat', note: 'drafted purchase orders' },
    { label: 'Profiled tonight', value: tonight.length, tone: 'up', note: 'guests on the book' },
  ];
}
