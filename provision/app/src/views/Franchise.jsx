import { getFranchise } from '../lib/api.js';
import { useApiData } from '../lib/useApiData.js';
import { SectionTitle, Kpi, KpiGrid, Badge, Dot, Progress, Empty } from '../components/ui.jsx';
import { Truck, Alert, Check, Clock, Users, Sparkle } from '../components/icons.jsx';

// The owner dashboard for the Mise franchise agent layer. READ-ONLY: it renders what the
// agents decided and layers days-of-cover analysis on top. It never writes, so it cannot
// conflict with the agent layer.
const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const qty = (n, unit) => `${n} ${unit}`;

const STATUS_BADGE = { critical: 'no', low: 'warn', surplus: 'accent', ok: 'ok', idle: '' };
const STATUS_LABEL = { critical: 'Critical', low: 'Low', surplus: 'Surplus', ok: 'Healthy', idle: 'Idle' };

function StockRow({ r }) {
  const pct = r.par ? Math.round((r.onHand / r.par) * 100) : 100;
  return (
    <div className="py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-1.5">
        <Dot status={r.status === 'surplus' ? 'ok' : r.status} />
        <span className="text-[13px] font-medium t-ink flex-1 min-w-0 truncate">{r.name}</span>
        <span className="kv text-[13px] tnum">{r.onHand}</span>
        <span className="text-[12px] t-mut">/ {r.par} {r.unit}</span>
      </div>
      <Progress pct={pct} tone={r.status === 'critical' ? 'critical' : r.status === 'low' ? 'low' : 'ok'} />
      <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[12px] t-mut">
        {r.daysOfCover !== null && (
          <span className={r.status === 'critical' ? 't-red font-semibold' : ''}>
            {r.daysOfCover}d cover
          </span>
        )}
        {r.dailyBurn > 0 && <span>· {r.dailyBurn}/day</span>}
        {r.leadTimeDays !== null && <span>· {r.leadTimeDays}d lead</span>}
        {r.spoilQty > 0 && <span className="t-red">· {r.spoilQty} {r.unit} will spoil</span>}
        {r.silentStockout && <Badge kind="no">above reorder, still runs out</Badge>}
      </div>
    </div>
  );
}

export default function Franchise() {
  const { data, loading, error } = useApiData(getFranchise);

  if (loading && !data) return <div className="t-mut py-10">Loading…</div>;
  if (error) return <Empty title="Could not load the franchise view" body={error} />;

  const { franchise, mode, branches = [], transfers = [], purchases = [], promotions = [], totals = {} } = data || {};

  return (
    <>
      <KpiGrid>
        <Kpi label="Branches" value={totals.branches ?? 0} note={franchise} />
        <Kpi label="Critical" value={totals.critical ?? 0} tone={totals.critical ? 'down' : 'flat'} note="inside lead-time cover" />
        <Kpi label="Silent stockouts" value={totals.silentStockouts ?? 0} tone={totals.silentStockouts ? 'down' : 'flat'} note="above reorder, still run out" />
        <Kpi label="Waste avoided" value={`${totals.wasteAvoidedKg ?? 0} kg`} tone="up" note="by the proposed transfer" />
        <Kpi label="To purchase" value={money(totals.purchaseTotal)} note={`${totals.purchases ?? 0} order(s)`} />
      </KpiGrid>

      {/* The showpiece: one approval card, transfers first then purchases. */}
      <SectionTitle note="Transfers first, then only the net shortage is bought">
        This week's plan
      </SectionTitle>

      {!transfers.length && !purchases.length ? (
        <Empty title="Nothing proposed yet" body="Run the rebalance-and-procure agent to populate this." />
      ) : (
        <div className="card p-5">
          {transfers.map((t, i) => (
            <div key={i} className="flex items-start gap-3 pb-4 mb-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="w-9 h-9 rounded-2xl grid place-items-center t-accent shrink-0"
                style={{ background: 'var(--accent-soft)' }}><Truck size={17} /></div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] t-display font-semibold mb-1">
                  Move {qty(t.qty, t.unit)} of {t.product} — {t.fromName} → {t.toName}
                </div>
                <p className="text-[13px] t-mut leading-relaxed mb-2">{t.reason}</p>
                <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
                  <Badge kind="ok">
                    {t.toName} cover {t.coverBefore}d → {t.coverAfter}d
                  </Badge>
                  {t.coverAfter !== null && (
                    <span className="t-accent font-semibold">
                      Same day — the fastest supplier is {t.fastestSupplierLead}d away
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {purchases.map((p, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-2xl grid place-items-center shrink-0"
                style={{ background: p.late ? 'color-mix(in oklab, var(--red) 12%, transparent)' : 'var(--raised)',
                  color: p.late ? 'var(--red)' : 'var(--muted)' }}>
                {p.late ? <Alert size={17} /> : <Check size={17} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] t-display font-semibold mb-1">
                  Buy {qty(p.qty, p.unit)} of {p.product} from {p.supplier} — {money(p.total)}
                </div>
                <div className="text-[13px] t-mut mb-2">
                  {money(p.unit_price)}/{p.unit} · arrives in {p.etaDays} days · for {p.branchName}
                </div>

                {p.late && (
                  <div className="card !shadow-none p-3.5 mb-2"
                    style={{ background: 'color-mix(in oklab, var(--red) 8%, transparent)',
                      borderColor: 'color-mix(in oklab, var(--red) 35%, transparent)' }}>
                    <div className="eyebrow mb-1.5" style={{ color: 'var(--red)' }}>This order arrives late</div>
                    <p className="text-[13px] t-ink leading-relaxed">{p.lateNote}</p>
                  </div>
                )}

                {p.fasterAvailable && (
                  <div className="text-[12.5px] t-mut leading-relaxed">
                    <strong className="t-ink">{p.fasterAvailable.name}</strong> delivers in{' '}
                    {p.fasterAvailable.leadTimeDays}d — {money(Math.abs(p.fasterAvailable.costDelta))} more,
                    and {p.fasterAvailable.daysSaved} fewer days of empty shelf.
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 mt-5 pt-4 flex-wrap" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-[12.5px] t-mut flex items-center gap-1.5">
              <Clock size={13} /> Read-only view — approvals happen in the owner surface.
            </span>
          </div>
        </div>
      )}

      <SectionTitle note="Days of cover is on-hand ÷ actual burn, not the hand-authored reorder point">
        Branches
      </SectionTitle>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))]">
        {branches.map((b) => {
          const crit = b.rows.filter((r) => r.status === 'critical').length;
          return (
            <div key={b.id} className="card p-[18px] flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[16px] font-semibold t-display flex-1">{b.name}</span>
                {crit > 0
                  ? <Badge kind="no">{crit} critical</Badge>
                  : <Badge kind="ok">healthy</Badge>}
              </div>
              <div className="eyebrow mb-2">{b.city}</div>
              <div>
                {b.rows.map((r) => <StockRow key={r.sku} r={r} />)}
              </div>
            </div>
          );
        })}
      </div>

      {promotions.length > 0 && (
        <>
          <SectionTitle note="Auto-generated from surplus and near-expiry stock">Promotions</SectionTitle>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr))]">
            {promotions.map((p, i) => (
              <div key={i} className="card p-[17px] flex flex-col lift">
                <div className="flex items-center gap-2 mb-2.5">
                  <Sparkle size={13} className="t-accent" />
                  <span className="eyebrow">{p.branch_name} · {p.menu_item}</span>
                </div>
                <h3 className="text-[15.5px] font-semibold t-display leading-snug mb-2">{p.headline}</h3>
                <p className="text-[13px] t-mut leading-relaxed mb-3">{p.reason}</p>
                <Badge kind="accent" className="self-start mt-auto">{p.discount_pct}% off</Badge>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="card p-4 mt-6">
        <div className="eyebrow mb-1.5">About this view</div>
        <p className="text-[13px] t-mut leading-relaxed">
          Read-only over the Mise agent layer's records{' '}
          {mode === 'fixture'
            ? '— currently rendering the bundled fixture, shaped exactly like the live records. Set MISE_RUNTYPE_TOKEN to read them live.'
            : '— reading live records from Runtype.'}
          {' '}Days of cover, spoilage and the late-arrival check are computed here; the transfer
          and purchase decisions come from the agents.
        </p>
      </div>
    </>
  );
}
