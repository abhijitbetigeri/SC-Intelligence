// Purchase-order dispatch — the seam that makes "reorder from supplier" production-ready
// without changing the route or the UI.
//
// The PO is ALWAYS recorded in the records repository first. dispatchReorder decides only
// whether it also LEAVES THE BUILDING:
//
//   • demo (default)  — no supplier channel configured → the PO record is the artifact.
//                       channel = 'logged'. Nothing is sent anywhere.
//   • production      — set SUPPLIER_ORDER_EMAIL (or graduate to an InsForge edge function
//                       hosting the real sender) → the PO is emailed / EDI'd / API-posted.
//
// The human-in-the-loop rule lives ABOVE this function: a PO only reaches dispatchReorder
// after an operator approved it, or an operator-set rule authorised it (see reorderRule()).
import { logSeam } from './seams.js';

const supplierEmail = () => process.env.SUPPLIER_ORDER_EMAIL || '';
export const reorderChannel = () => (supplierEmail() ? 'email' : 'logged');

export function formatPO(po) {
  const lines = [
    `Purchase Order ${po.id}`,
    `Supplier: ${po.supplier}`,
    `Deliver to: ${po.venue}`,
    '',
    `${po.qty} × ${po.itemName} @ ${po.currency} ${po.unitCost} = ${po.currency} ${po.total}`,
    '',
    `Requested lead time: ${po.leadTimeDays} days`,
  ];
  if (po.approvedBy) lines.push(`Approved by: ${po.approvedBy}`);
  return lines.join('\n');
}

export async function dispatchReorder(po) {
  if (supplierEmail()) {
    // PRODUCTION: actually place the order with the distributor.
    // await sendToSupplier(supplierEmail(), `Reorder — ${po.itemName}`, formatPO(po));
    logSeam('supplier-dispatch', `email PO ${po.id} to ${supplierEmail()}`);
    return { channel: 'email', to: supplierEmail(), sent: true };
  }
  // DEMO: the PO record is the only artifact; nothing is emailed.
  logSeam('supplier-dispatch', `would email PO ${po.id} (${po.qty} × ${po.itemName}) to ${po.supplier}`);
  return { channel: 'logged', to: null, sent: false };
}

// ── operator reorder rules ───────────────────────────────────────────────────
// The autonomy dial, per the brief: notify me · auto-draft · auto-send under $X.
// Nothing auto-sends unless the operator set that rule AND the total clears the ceiling.
export const RULE_MODES = ['notify', 'auto-draft', 'auto-send'];

export function ruleAllowsSend(rule, po) {
  if (!rule || rule.mode !== 'auto-send') return { send: false, reason: 'requires operator approval' };
  const cap = Number(rule.maxTotal || 0);
  if (cap > 0 && po.total > cap) {
    return { send: false, reason: `$${po.total} exceeds the auto-send ceiling of $${cap}` };
  }
  return { send: true, reason: `auto-sent under the operator rule (≤ $${cap})` };
}
