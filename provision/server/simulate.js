// Deterministic simulation substrate.
//
// The whole app runs with zero external services, so the demo data has to be believable AND
// stable: the same seed produces the same suppliers, stock levels, guests and 60 days of
// sales tickets on every boot and every request. No Math.random anywhere.
//
// Sales tickets are the SOURCE OF TRUTH. Demand forecasts and guest predictions are both
// computed FROM the tickets (see forecast.js) rather than invented — which is what lets the
// UI show its work: "12 sold over the last 14 days, Fridays run 1.8x".
import { records } from './records.js';

// ── seeded PRNG (mulberry32) ─────────────────────────────────────────────────
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const round2 = (n) => Math.round(n * 100) / 100;

export const SEED = Number(process.env.SIM_SEED || 20260718);
export const VENUE = 'Above Eleven';

// ── suppliers ────────────────────────────────────────────────────────────────
// reliability = share of POs delivered complete and on time (drives the ranking in
// forecast.js#chooseSupplier alongside cost and lead time).
export const SUPPLIERS = [
  { code: 'bourdon',  name: 'Domaine Bourdon',    category: 'wine',    leadTimeDays: 3, reliability: 0.96, terms: 'Net 30', channel: 'email',  contact: 'orders@domainebourdon.fr' },
  { code: 'cellar',   name: 'Cellar Direct',      category: 'wine',    leadTimeDays: 6, reliability: 0.91, terms: 'Net 15', channel: 'email',  contact: 'trade@cellardirect.com' },
  { code: 'pacific',  name: 'Pacific Produce Co', category: 'produce', leadTimeDays: 1, reliability: 0.93, terms: 'Net 7',  channel: 'api',    contact: 'api@pacificproduce.com' },
  { code: 'bayfish',  name: 'Bay Seafood Direct', category: 'seafood', leadTimeDays: 1, reliability: 0.88, terms: 'COD',    channel: 'email',  contact: 'desk@bayseafood.com' },
  { code: 'ggmeats',  name: 'Golden Gate Meats',  category: 'protein', leadTimeDays: 2, reliability: 0.95, terms: 'Net 21', channel: 'edi',    contact: 'edi@ggmeats.com' },
  { code: 'ferrydry', name: 'Ferry Dry Goods',    category: 'dry',     leadTimeDays: 4, reliability: 0.98, terms: 'Net 30', channel: 'email',  contact: 'orders@ferrydry.com' },
  // Cheaper but slower — creates a genuine cost-vs-lead-time tension on high-volume seafood,
  // which is what the sourcing insight surfaces.
  { code: 'coastal',  name: 'Coastal Wholesale',  category: 'seafood', leadTimeDays: 4, reliability: 0.90, terms: 'Net 30', channel: 'email',  contact: 'sales@coastalwholesale.com' },
];

// ── inventory catalogue ──────────────────────────────────────────────────────
// onHand is authored (not simulated) so the demo opens on a specific, defensible picture:
// a handful of genuinely critical items, several healthy ones. baseDaily seeds the ticket
// generator; actual velocity is then measured back off the generated tickets.
export const CATALOG = [
  // wine
  { sku: 'w-saint-veran', name: 'Saint-Véran 2022',            category: 'wine',    unit: 'bottle', onHand: 2,  par: 12, reorderPoint: 6,  unitCost: 22,   baseDaily: 1.7, options: [['bourdon', 22, 3, 12], ['cellar', 24.5, 6, 6]] },
  { sku: 'w-meursault',   name: 'Meursault 1er Cru 2019',      category: 'wine',    unit: 'bottle', onHand: 5,  par: 6,  reorderPoint: 3,  unitCost: 78,   baseDaily: 0.6, options: [['bourdon', 78, 3, 6]] },
  { sku: 'w-sancerre',    name: 'Sancerre, Les Belles Dames',  category: 'wine',    unit: 'bottle', onHand: 9,  par: 12, reorderPoint: 6,  unitCost: 19,   baseDaily: 1.2, options: [['cellar', 19, 6, 12], ['bourdon', 20.5, 3, 6]] },
  { sku: 'w-barolo',      name: 'Barolo, Serralunga 2018',     category: 'wine',    unit: 'bottle', onHand: 3,  par: 8,  reorderPoint: 4,  unitCost: 54,   baseDaily: 0.7, options: [['cellar', 54, 6, 6]] },
  { sku: 'w-champagne',   name: 'Champagne Brut NV',           category: 'wine',    unit: 'bottle', onHand: 14, par: 18, reorderPoint: 9,  unitCost: 34,   baseDaily: 1.5, options: [['cellar', 34, 6, 12], ['bourdon', 35.8, 3, 6]] },
  { sku: 'w-chablis',     name: 'Chablis 2022',                category: 'wine',    unit: 'bottle', onHand: 11, par: 12, reorderPoint: 6,  unitCost: 26,   baseDaily: 1.0, options: [['bourdon', 26, 3, 12]] },
  // seafood
  { sku: 'f-hotate',      name: 'Hokkaido scallop (hotate)',   category: 'seafood', unit: 'piece',  onHand: 18, par: 60, reorderPoint: 30, unitCost: 3.4,  baseDaily: 7.5, options: [['bayfish', 3.4, 1, 20], ['coastal', 2.85, 4, 40]] },
  { sku: 'f-uni',         name: 'Santa Barbara uni',           category: 'seafood', unit: 'tray',   onHand: 3,  par: 8,  reorderPoint: 4,  unitCost: 42,   baseDaily: 0.9, options: [['bayfish', 42, 1, 2]] },
  { sku: 'f-hamachi',     name: 'Hamachi loin',                category: 'seafood', unit: 'lb',     onHand: 12, par: 14, reorderPoint: 7,  unitCost: 21,   baseDaily: 1.8, options: [['bayfish', 21, 1, 4]] },
  // protein
  { sku: 'p-wagyu',       name: 'Wagyu striploin A5',          category: 'protein', unit: 'lb',     onHand: 4,  par: 10, reorderPoint: 5,  unitCost: 96,   baseDaily: 1.1, options: [['ggmeats', 96, 2, 4]] },
  { sku: 'p-duck',        name: 'Duck breast',                 category: 'protein', unit: 'each',   onHand: 20, par: 24, reorderPoint: 12, unitCost: 11,   baseDaily: 2.6, options: [['ggmeats', 11, 2, 12]] },
  { sku: 'p-lamb',        name: 'Lamb rack',                   category: 'protein', unit: 'each',   onHand: 15, par: 16, reorderPoint: 8,  unitCost: 28,   baseDaily: 1.6, options: [['ggmeats', 28, 2, 8]] },
  // produce
  { sku: 'v-matsutake',   name: 'Matsutake mushroom',          category: 'produce', unit: 'lb',     onHand: 1,  par: 6,  reorderPoint: 3,  unitCost: 58,   baseDaily: 0.8, options: [['pacific', 58, 1, 2]] },
  { sku: 'v-yuzu',        name: 'Yuzu',                        category: 'produce', unit: 'each',   onHand: 34, par: 40, reorderPoint: 20, unitCost: 2.2,  baseDaily: 3.4, options: [['pacific', 2.2, 1, 20]] },
  { sku: 'v-shiso',       name: 'Shiso leaf',                  category: 'produce', unit: 'bunch',  onHand: 7,  par: 20, reorderPoint: 10, unitCost: 3.1,  baseDaily: 2.2, options: [['pacific', 3.1, 1, 10]] },
  { sku: 'v-asparagus',   name: 'White asparagus',             category: 'produce', unit: 'bunch',  onHand: 16, par: 18, reorderPoint: 9,  unitCost: 6.5,  baseDaily: 1.9, options: [['pacific', 6.5, 1, 6]] },
  // dry
  { sku: 'd-koshihikari', name: 'Koshihikari rice',            category: 'dry',     unit: 'kg',     onHand: 31, par: 40, reorderPoint: 20, unitCost: 4.8,  baseDaily: 2.1, options: [['ferrydry', 4.8, 4, 20]] },
  { sku: 'd-olive-oil',   name: 'Arbequina olive oil',         category: 'dry',     unit: 'L',      onHand: 10, par: 12, reorderPoint: 6,  unitCost: 17,   baseDaily: 0.9, options: [['ferrydry', 17, 4, 6]] },
];

// menu price ≈ 3.2x cost for food, 2.6x for wine — only used to make ticket totals plausible
const menuPrice = (it) => round2(it.unitCost * (it.category === 'wine' ? 2.6 : 3.2));

// ── guests ───────────────────────────────────────────────────────────────────
// `favorites` are SKU affinities (weight = relative pull). The predictor never reads this
// list directly — it reads the guest's TICKETS, which are generated from it. That keeps the
// prediction path honest: it is always grounded in what they actually ordered.
export const GUESTS = [
  { key: 'tan',      name: 'M. Tan',       tier: 'VIP',     cadenceDays: 7,  avgCheck: 340, allergies: ['Shellfish — dining guest, not the member'], notes: 'Prefers table 12. Always starts with a glass of white.', favorites: [['w-meursault', 5], ['f-hotate', 4], ['p-wagyu', 3], ['v-shiso', 1]], reservation: { time: '20:00', party: 2, table: '12' } },
  { key: 'reyes',    name: 'A. Reyes',     tier: 'VIP',     cadenceDays: 10, avgCheck: 280, allergies: [], notes: 'Celebrates anniversaries here — champagne on arrival lands well.', favorites: [['w-champagne', 5], ['f-uni', 4], ['f-hamachi', 3], ['v-yuzu', 2]], reservation: { time: '19:30', party: 4, table: '7' } },
  { key: 'okafor',   name: 'L. Okafor',    tier: 'VIP',     cadenceDays: 12, avgCheck: 410, allergies: ['No pork'], notes: 'Hosts business dinners — orders for the table.', favorites: [['w-chablis', 4], ['f-hotate', 4], ['v-asparagus', 3], ['p-lamb', 2]], reservation: { time: '18:45', party: 6, table: '3' } },
  { key: 'wong',     name: 'S. Wong',      tier: 'Regular', cadenceDays: 14, avgCheck: 180, allergies: [], notes: 'Bar seat, early. In and out in 70 minutes.', favorites: [['w-sancerre', 5], ['p-duck', 4], ['v-yuzu', 1]], reservation: { time: '21:00', party: 2, table: 'Bar 2' } },
  { key: 'suthi',    name: 'P. Suthi',     tier: 'Regular', cadenceDays: 18, avgCheck: 220, allergies: [], notes: 'Reds only. Will ask what is new by the glass.', favorites: [['w-barolo', 5], ['p-lamb', 4], ['d-olive-oil', 1]], reservation: null },
  { key: 'nakamura', name: 'J. Nakamura',  tier: 'Regular', cadenceDays: 11, avgCheck: 195, allergies: [], notes: 'Knows the sushi counter team by name.', favorites: [['w-saint-veran', 4], ['f-hamachi', 4], ['v-shiso', 2], ['d-koshihikari', 2]], reservation: null },
  { key: 'duval',    name: 'C. Duval',     tier: 'Lapsing', cadenceDays: 21, avgCheck: 260, allergies: [], notes: 'Last seen 9 weeks ago. Was a monthly regular.', favorites: [['w-meursault', 4], ['v-matsutake', 4], ['p-duck', 2]], reservation: null },
  { key: 'iyer',     name: 'R. Iyer',      tier: 'Regular', cadenceDays: 16, avgCheck: 210, allergies: ['Tree nuts'], notes: 'Vegetarian partner — always needs a second main.', favorites: [['w-champagne', 4], ['p-duck', 3], ['v-yuzu', 3], ['v-asparagus', 2]], reservation: null },
];

// ── ticket generation ────────────────────────────────────────────────────────
const DOW_FACTOR = [0.55, 0.5, 0.7, 0.9, 1.35, 1.8, 1.25]; // Sun..Sat — weekend-heavy service
const dayKey = (d) => d.toISOString().slice(0, 10);

// Weighted sample without replacement.
function sampleWeighted(r, pairs, n) {
  const pool = pairs.map(([k, w]) => ({ k, w }));
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let t = r() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) { t -= pool[idx].w; if (t <= 0) break; }
    const chosen = pool[Math.min(idx, pool.length - 1)];
    out.push(chosen.k);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return out;
}

// Venue-wide popularity, derived from baseDaily — what a walk-in is likely to order.
const POPULARITY = CATALOG.map((it) => [it.sku, it.baseDaily]);

// Generate `days` of sales tickets ending yesterday (today is still in service).
export function generateTickets(days = 60) {
  const r = rng(SEED);
  const bySku = Object.fromEntries(CATALOG.map((it) => [it.sku, it]));
  const tickets = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let back = days; back >= 1; back--) {
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    const date = dayKey(d);
    const dow = d.getDay();
    const covers = Math.round((34 + r() * 16) * DOW_FACTOR[dow]);
    const ticketCount = Math.max(4, Math.round(covers / 2.4));

    for (let i = 0; i < ticketCount; i++) {
      // Does a known guest own this ticket? Their cadence sets the odds.
      let guest = null;
      for (const g of GUESTS) {
        const odds = (1 / g.cadenceDays) * (g.tier === 'Lapsing' && back < 63 ? 0.12 : 1) / ticketCount;
        if (r() < odds * 2.2) { guest = g; break; }
      }
      const affinity = guest ? guest.favorites : POPULARITY;
      const lineCount = guest ? 2 + Math.floor(r() * 2) : 1 + Math.floor(r() * 2);
      const skus = sampleWeighted(r, affinity, lineCount);
      const lines = skus.map((sku) => {
        const it = bySku[sku];
        const qty = it.category === 'wine' ? 1 : 1 + Math.floor(r() * 2);
        return { sku, name: it.name, qty, unitPrice: menuPrice(it), total: round2(menuPrice(it) * qty) };
      });
      if (!lines.length) continue;
      tickets.push({
        date,
        dow,
        dayPart: r() < 0.22 ? 'lunch' : 'dinner',
        guestKey: guest ? guest.key : null,
        server: pick(r, ['Sofia', 'Tim', 'Andre', 'Priya']),
        table: String(1 + Math.floor(r() * 18)),
        lines,
        check: round2(lines.reduce((s, l) => s + l.total, 0)),
      });
    }
  }
  return tickets;
}

// ── idempotent seeding into the records repository ───────────────────────────
// Suppliers / items / guests / tickets all become records so that every read path in the
// app goes through the SAME repository the InsForge driver will back later.
export function seedSimulation() {
  if (records.list('supplier').length) return { seeded: false };

  const suppliers = records.replaceAll('supplier', SUPPLIERS.map((s) => ({ ...s })));
  const byCode = Object.fromEntries(suppliers.map((s) => [s.code, s]));

  records.replaceAll('item', CATALOG.map((it) => ({
    sku: it.sku,
    name: it.name,
    category: it.category,
    unit: it.unit,
    onHand: it.onHand,
    par: it.par,
    reorderPoint: it.reorderPoint,
    unitCost: it.unitCost,
    onOrder: 0,
    venue: VENUE,
    // supplier options: [supplierCode, unitCost, leadTimeDays, moq]
    supplierOptions: it.options.map(([code, unitCost, leadTimeDays, moq]) => ({
      supplierId: byCode[code]?.id || null, supplierCode: code, supplierName: byCode[code]?.name || code,
      unitCost, leadTimeDays, moq, reliability: byCode[code]?.reliability ?? 0.9,
    })),
  })));

  records.replaceAll('guest', GUESTS.map((g) => ({
    key: g.key, name: g.name, tier: g.tier, avgCheck: g.avgCheck,
    allergies: g.allergies, notes: g.notes, cadenceDays: g.cadenceDays,
    reservation: g.reservation, venue: VENUE,
  })));

  // Tickets are stored as ONE record per service day to keep the local JSON store small
  // (60 records instead of ~1,800). forecast.js flattens them back out.
  const tickets = generateTickets(60);
  const byDate = new Map();
  for (const t of tickets) {
    if (!byDate.has(t.date)) byDate.set(t.date, []);
    byDate.get(t.date).push(t);
  }
  records.replaceAll('ticketday', [...byDate.entries()].map(([date, rows]) => ({
    date, count: rows.length, covers: rows.reduce((s, t) => s + t.lines.length, 0), tickets: rows,
  })));

  return { seeded: true, suppliers: suppliers.length, items: CATALOG.length, guests: GUESTS.length, days: byDate.size };
}

// Flatten the per-day ticket records back into a single ticket list.
export const allTickets = () =>
  records.list('ticketday').flatMap((d) => d.tickets || []);
