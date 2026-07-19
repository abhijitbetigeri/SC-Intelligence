import { useState } from 'react';
import { getStock, getPos, reorder, approvePo, cancelPo, getRule, saveRule } from '../lib/api.js';
import { useApiData } from '../lib/useApiData.js';
import { SectionTitle, Kpi, KpiGrid, Badge, Dot, Progress, Modal, Empty } from '../components/ui.jsx';
import { Truck, Check, Clock } from '../components/icons.jsx';
import { plural } from '../lib/units.js';

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const money0 = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const RULE_COPY = {
  'notify': 'Tell me when something drops below par. I place every order myself.',
  'auto-draft': 'Draft the purchase order for me. I still approve before it sends.',
  'auto-send': 'Send it automatically when the order is under the ceiling. Larger orders still wait for me.',
};

// The autonomy dial. Nothing reaches a supplier unless the operator set a rule that
// authorises it, or approves it by hand — this control is where that consent lives.
// Mounted only once the rule has loaded (see the call site), so `cap` initialises from real
// server state instead of a placeholder that never syncs.
function RuleBar({ rule, onSave }) {
  const [busy, setBusy] = useState(false);
  const [cap, setCap] = useState(rule.maxTotal ?? 250);

  async function set(mode, maxTotal = cap) {
    setBusy(true);
    try { await onSave({ mode, maxTotal: Number(maxTotal) || 0 }); } finally { setBusy(false); }
  }

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <div className="eyebrow mb-1.5">When stock runs low</div>
          <p className="text-[13px] t-mut">{RULE_COPY[rule.mode]}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="pill" value={rule.mode} disabled={busy} onChange={(e) => set(e.target.value)}>
            <option value="notify">Notify me</option>
            <option value="auto-draft">Auto-draft</option>
            <option value="auto-send">Auto-send under…</option>
          </select>
          {rule.mode === 'auto-send' && (
            <span className="flex items-center gap-1.5">
              <span className="text-[13px] t-mut">$</span>
              <input className="field !w-[92px] tnum" type="number" min="0" value={cap} disabled={busy}
                onChange={(e) => setCap(e.target.value)}
                onBlur={() => set('auto-send', cap)} aria-label="Auto-send ceiling" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === 'critical') return <Badge kind="no">Critical</Badge>;
  if (status === 'low') return <Badge kind="warn">Below par</Badge>;
  return <Badge kind="ok">Healthy</Badge>;
}

// A row in the needs-attention panel — the number that matters is days of cover against
// the supplier's lead time, not the raw count.
function AttentionCard({ r, onReorder, busy }) {
  return (
    <div className="card p-4 flex flex-col lift">
      <div className="flex items-center gap-2 mb-2">
        <Dot status={r.status} />
        <span className="eyebrow">{r.category}</span>
        <span className="ml-auto"><StatusBadge status={r.status} /></span>
      </div>
      <h3 className="text-[16px] font-semibold t-display leading-snug mb-2">{r.name}</h3>

      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="kv text-[26px] leading-none">{r.onHand}</span>
        <span className="text-[13px] t-mut">/ {r.par} {plural(r.par, r.unit)} on hand</span>
      </div>
      <div className="mb-3"><Progress pct={r.pctOfPar} tone={r.status} /></div>

      <p className="text-[12.5px] t-mut mb-3 leading-relaxed">
        {r.daysOfCover === null
          ? 'No recent sales — cover cannot be computed.'
          : <>Selling {r.dailyAvg}/day — <strong className="t-ink">{r.daysOfCover} days of cover</strong> against a {r.leadTimeDays}-day lead from {r.supplier}.</>}
      </p>

      {r.onOrder > 0 && (
        <div className="text-[12px] t-accent font-semibold mb-2.5 flex items-center gap-1.5">
          <Truck size={13} /> {r.onOrder} {plural(r.onOrder, r.unit)} on order
        </div>
      )}

      <button className="btn primary self-start mt-auto" disabled={busy} onClick={() => onReorder(r)}>
        {busy ? 'Drafting…' : 'Reorder'}
      </button>
    </div>
  );
}

export default function Stock() {
  const stock = useApiData(getStock);
  const pos = useApiData(getPos);
  const rule = useApiData(getRule);
  const [draft, setDraft] = useState(null);     // { po, draft, autoSent, reason }
  const [busySku, setBusySku] = useState(null);
  const [sending, setSending] = useState(false);

  if (stock.loading && !stock.data) return <div className="t-mut py-10">Loading…</div>;
  if (stock.error) return <Empty title="Could not load the stock board" body={stock.error} />;

  const { rows = [], counts = {}, stockValue = 0 } = stock.data || {};
  const attention = rows.filter((r) => r.status !== 'ok');
  const orders = pos.data?.pos || [];
  const drafts = orders.filter((p) => p.stage === 'draft');

  const reloadAll = () => { stock.reload(); pos.reload(); };

  async function onReorder(r) {
    setBusySku(r.sku);
    try {
      const res = await reorder(r.sku);
      setDraft(res);
      reloadAll();
    } catch (e) {
      setDraft({ error: e.message || String(e) });
    } finally {
      setBusySku(null);
    }
  }

  async function send(poId) {
    setSending(true);
    try {
      await approvePo(poId);
      setDraft(null);
      reloadAll();
    } catch (e) {
      setDraft((d) => ({ ...d, error: e.message || String(e) }));
    } finally {
      setSending(false);
    }
  }

  async function discard(poId) {
    setSending(true);
    try {
      await cancelPo(poId);
      setDraft(null);
      reloadAll();
    } finally {
      setSending(false);
    }
  }

  const d = draft?.draft;
  const po = draft?.po;

  return (
    <>
      <KpiGrid>
        <Kpi label="Critical" value={counts.critical ?? 0} tone={counts.critical ? 'down' : 'flat'} note="below lead-time cover" />
        <Kpi label="Below par" value={counts.low ?? 0} note="at or under reorder point" />
        <Kpi label="Healthy" value={counts.ok ?? 0} tone="up" note="no action needed" />
        <Kpi label="Stock on hand" value={money0(stockValue)} note={`${rows.length} tracked items`} />
        <Kpi label="Awaiting approval" value={drafts.length} note="drafted orders" />
      </KpiGrid>

      <SectionTitle>Reorder rule</SectionTitle>
      {rule.data?.rule && (
        <RuleBar rule={rule.data.rule} onSave={async (r) => { await saveRule(r); rule.reload(); }} />
      )}

      <SectionTitle note={attention.length ? `${attention.length} of ${rows.length} items` : null}>
        Needs attention
      </SectionTitle>
      {attention.length ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
          {attention.map((r) => (
            <AttentionCard key={r.sku} r={r} busy={busySku === r.sku} onReorder={onReorder} />
          ))}
        </div>
      ) : (
        <Empty title="Everything is above par" body="No item is inside its supplier lead time." />
      )}

      {orders.length > 0 && (
        <>
          <SectionTitle note="Draft → sent → confirmed → received → reconciled">Purchase orders</SectionTitle>
          <div className="card overflow-hidden">
            <table>
              <thead>
                <tr>
                  <th>Item</th><th>Supplier</th><th className="num">Qty</th>
                  <th className="num">Total</th><th>Stage</th><th>Channel</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium t-ink">{p.itemName}</td>
                    <td className="t-mut">{p.supplier}</td>
                    <td className="num">{p.qty}</td>
                    <td className="num">{money(p.total)}</td>
                    <td>
                      {p.stage === 'draft'
                        ? <Badge kind="warn">Draft</Badge>
                        : <Badge kind="ok">{p.stage}</Badge>}
                    </td>
                    <td className="t-mut">{p.channel === 'logged' ? 'logged (demo)' : p.channel || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <SectionTitle>All stock</SectionTitle>
      <div className="card overflow-hidden">
        <table>
          <thead>
            <tr>
              <th>Item</th><th>Category</th><th className="num">On hand</th><th className="num">Par</th>
              <th className="num">Per day</th><th className="num">Cover</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sku}>
                <td className="font-medium t-ink">{r.name}</td>
                <td className="t-mut">{r.category}</td>
                <td className="num">{r.onHand}{r.onOrder ? <span className="t-accent"> +{r.onOrder}</span> : null}</td>
                <td className="num t-mut">{r.par}</td>
                <td className="num t-mut">{r.dailyAvg}</td>
                <td className="num">{r.daysOfCover === null ? '—' : `${r.daysOfCover}d`}</td>
                <td><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Draft PO — every number the decision was made on, then one confirm. */}
      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={draft?.error ? 'Could not draft the order' : draft?.autoSent ? 'Order sent automatically' : 'Draft purchase order'}
        subtitle={po ? `${po.id} · ${po.supplier}` : null}
        footer={!draft?.error && po && po.stage === 'draft' ? (
          <>
            <button className="btn danger" disabled={sending} onClick={() => discard(po.id)}>Discard</button>
            <button className="btn" disabled={sending} onClick={() => setDraft(null)}>Keep as draft</button>
            <button className="btn primary" disabled={sending} onClick={() => send(po.id)}>
              {sending ? 'Sending…' : 'Send to supplier'}
            </button>
          </>
        ) : (
          <button className="btn" onClick={() => setDraft(null)}>Close</button>
        )}
      >
        {draft?.error && <p className="text-[13px] t-red">{draft.error}</p>}

        {d && (
          <>
            <div className="flex items-baseline gap-2 flex-wrap mb-1">
              <span className="kv text-[30px] leading-none">{d.qty}</span>
              <span className="text-[15px] t-ink">{plural(d.qty, d.unit)} of {d.itemName}</span>
            </div>
            <div className="text-[13px] t-mut mb-4">
              {money(d.unitCost)} per {d.unit} · <strong className="t-ink">{money(d.total)}</strong> total ·
              arrives in {d.leadTimeDays} days
            </div>

            <div className="card !shadow-none p-4 mb-3" style={{ background: 'var(--raised)' }}>
              <div className="eyebrow mb-2">Why this order</div>
              <ul className="flex flex-col gap-1.5 text-[13px] t-ink pl-4 list-disc">
                {d.why.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>

            <div className="card !shadow-none p-4 mb-3" style={{ background: 'var(--raised)' }}>
              <div className="eyebrow mb-2">The forecast</div>
              <p className="text-[13px] t-ink leading-relaxed">{d.forecast.basis}</p>
              <p className="text-[13px] t-mut mt-1.5">
                Expected to sell <strong className="t-ink">{d.forecast.expected} {plural(d.forecast.expected, d.unit)}</strong> over
                the next {d.forecast.horizon} days.
              </p>
            </div>

            {d.ranked?.length > 1 && (
              <div className="card !shadow-none p-4 mb-3" style={{ background: 'var(--raised)' }}>
                <div className="eyebrow mb-2">Suppliers compared</div>
                <div className="flex flex-col gap-2">
                  {d.ranked.map((s, i) => (
                    <div key={s.supplierCode} className="flex items-center gap-2 text-[13px] flex-wrap">
                      {i === 0 ? <Check size={14} style={{ color: 'var(--accent)' }} /> : <span className="w-3.5" />}
                      <span className={i === 0 ? 't-ink font-semibold' : 't-mut'}>{s.supplierName}</span>
                      <span className="t-mut tnum">{money(s.unitCost)} · {s.leadTimeDays}d · {Math.round(s.reliability * 100)}%</span>
                      {/* Only mark the options we PASSED OVER as too slow — badging the chosen
                          supplier that way contradicts the checkmark next to it. */}
                      {i === 0
                        ? (!s.feasible && <Badge kind="warn">fastest available</Badge>)
                        : (!s.feasible && <Badge kind="no">too slow</Badge>)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {d.late && (
              <div className="card !shadow-none p-4 mb-3"
                style={{ background: 'color-mix(in oklab, var(--red) 8%, transparent)', borderColor: 'color-mix(in oklab, var(--red) 35%, transparent)' }}>
                <div className="eyebrow mb-1.5" style={{ color: 'var(--red)' }}>This order arrives late</div>
                <p className="text-[13px] t-ink leading-relaxed">{d.lateNote}</p>
              </div>
            )}

            <p className="text-[12.5px] t-mut flex items-start gap-1.5">
              {draft.autoSent
                ? <><Check size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} /> {cap(draft.reason)}</>
                : <><Clock size={14} className="mt-0.5 shrink-0" /> Nothing has been sent — {draft.reason}.</>}
            </p>
          </>
        )}
      </Modal>
    </>
  );
}
