// Records repository — the objects layer for the whole product.
//
//   records.create/list/get/update/remove(type, …)
//
// Every record: { id, type, createdAt, updatedAt, createdBy, ...fields }. Suppliers, SKUs,
// purchase orders, receipts, guests, tickets and forecasts are all records of a different
// `type`, so a new object type costs nothing.
//
// DEMO MODE (default): backed by local JSON via persist.js.
// PRODUCTION: the same interface fronts InsForge Postgres (see insforge.js) — views and
// routes never change when the driver swaps.
import { load, save } from './persist.js';

const nowISO = () => new Date().toISOString();
const store = new Map(load('records', []).map((r) => [r.id, r])); // hydrate from disk
// continue the id sequence past anything already persisted
let SEQ = [...store.values()].reduce((mx, r) => {
  const n = Number(String(r.id).split('_').pop());
  return Number.isFinite(n) ? Math.max(mx, n) : mx;
}, 1000);
const flush = () => save('records', [...store.values()]);

export const records = {
  list(type, filter = {}) {
    return [...store.values()]
      .filter((r) => r.type === type && Object.entries(filter).every(([k, v]) => r[k] === v))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },
  get(id) { return store.get(id) || null; },
  create(type, fields = {}, actor = null) {
    const id = `${type}_${++SEQ}`;
    const r = { id, type, createdAt: nowISO(), updatedAt: nowISO(), createdBy: actor, ...fields };
    store.set(id, r);
    flush();
    return r;
  },
  update(id, patch = {}) {
    const r = store.get(id);
    if (!r) return null;
    Object.assign(r, patch, { updatedAt: nowISO() });
    flush();
    return r;
  },
  remove(id) { const ok = store.delete(id); flush(); return ok; },
  // Replace a whole collection (used by the idempotent simulation seeder).
  replaceAll(type, rows, actor = 'seed') {
    for (const r of [...store.values()]) if (r.type === type) store.delete(r.id);
    const out = rows.map((f) => {
      const id = `${type}_${++SEQ}`;
      const r = { id, type, createdAt: nowISO(), updatedAt: nowISO(), createdBy: actor, ...f };
      store.set(id, r);
      return r;
    });
    flush();
    return out;
  },
};

// ── Purchase-order lifecycle ─────────────────────────────────────────────────
// draft → sent → confirmed → received → reconciled. Nothing leaves the building
// before `sent`, and moving to `sent` is always an operator action or an explicit
// operator-set rule (see reorder rules) — never an implicit side effect.
export const PO_STAGES = [
  { id: 'draft',      label: 'Draft',      hint: 'AI-drafted — awaiting approval' },
  { id: 'sent',       label: 'Sent',       hint: 'Dispatched to the supplier' },
  { id: 'confirmed',  label: 'Confirmed',  hint: 'Supplier acknowledged' },
  { id: 'received',   label: 'Received',   hint: 'Delivered — invoice attached' },
  { id: 'reconciled', label: 'Reconciled', hint: 'Matched against the invoice; stock posted' },
];
export const PO_STAGE_IDS = PO_STAGES.map((s) => s.id);

// Move a PO to a stage, appending an audit entry (who / when / from→to). Every state
// change in this product is auditable — that is the point of the human-in-the-loop rule.
export function moveStage(id, stage, actor = null) {
  const r = records.get(id);
  if (!r || !PO_STAGE_IDS.includes(stage)) return null;
  const history = [...(r.history || []), { from: r.stage || null, to: stage, at: nowISO(), by: actor }];
  return records.update(id, { stage, history });
}
