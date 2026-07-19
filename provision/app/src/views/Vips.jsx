import { useState } from 'react';
import { getVips } from '../lib/api.js';
import { useApiData } from '../lib/useApiData.js';
import { SectionTitle, Badge, Modal, Empty, Kpi, KpiGrid } from '../components/ui.jsx';
import { Clock, Users, Alert, Sparkle } from '../components/icons.jsx';

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const tierKind = (t) => (t === 'VIP' ? 'accent' : t === 'Lapsing' ? 'warn' : '');

// A predicted line. The confidence bar is deliberately never full — the model is a
// heuristic over their tickets, and the UI should not imply more certainty than that.
function Likely({ l }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[13.5px] t-ink font-medium truncate">{l.name}</span>
          {!l.inStock && <Badge kind="no">out of stock</Badge>}
        </div>
        <div className="ptrack mt-1.5">
          <i style={{ width: `${l.confidence}%`, background: l.inStock ? 'var(--accent)' : 'var(--red)' }} />
        </div>
      </div>
      <span className="kv text-[13px] tnum w-9 text-right">{l.confidence}%</span>
    </div>
  );
}

function GuestCard({ g, onOpen }) {
  const collision = g.likely.find((l) => !l.inStock);
  return (
    <div className="card p-[18px] flex flex-col lift cursor-pointer" onClick={() => onOpen(g)}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-9 h-9 rounded-full grid place-items-center kv text-[13px] shrink-0"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          {g.name.replace(/[^A-Za-z]/g, '')[0] || '?'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[16px] font-semibold t-display leading-tight truncate">{g.name}</div>
          <div className="text-[12px] t-mut flex items-center gap-1.5 mt-0.5">
            <Clock size={12} /> {g.reservation.time}
            <Users size={12} className="ml-1" /> {g.reservation.party}
            {g.reservation.table && <span className="t-mut">· table {g.reservation.table}</span>}
          </div>
        </div>
        <Badge kind={tierKind(g.tier)}>{g.tier}</Badge>
      </div>

      <div className="eyebrow mb-2">Likely order</div>
      <div className="flex flex-col gap-2.5 mb-3">
        {g.likely.map((l) => <Likely key={l.sku} l={l} />)}
      </div>

      {collision && (
        <div className="flex items-start gap-1.5 text-[12.5px] t-red mb-2.5">
          <Alert size={13} className="mt-0.5 shrink-0" />
          <span>{collision.name} is out — brief the floor on a substitute.</span>
        </div>
      )}

      {g.allergies.length > 0 && (
        <div className="flex items-start gap-1.5 text-[12.5px] mb-2.5" style={{ color: 'var(--warn)' }}>
          <Alert size={13} className="mt-0.5 shrink-0" />
          <span>{g.allergies.join(' · ')}</span>
        </div>
      )}

      <div className="mt-auto pt-2.5 text-[12.5px] t-mut" style={{ borderTop: '1px solid var(--border)' }}>
        {g.visits} visits · grounded in {g.grounding}
      </div>
    </div>
  );
}

export default function Vips() {
  const { data, loading, error } = useApiData(getVips);
  const [open, setOpen] = useState(null);

  if (loading && !data) return <div className="t-mut py-10">Loading…</div>;
  if (error) return <Empty title="Could not load tonight's book" body={error} />;

  const guests = data?.guests || [];
  const vips = guests.filter((g) => g.tier === 'VIP').length;
  const collisions = guests.filter((g) => g.likely.some((l) => !l.inStock)).length;
  const allergyFlags = guests.filter((g) => g.allergies.length).length;

  return (
    <>
      <KpiGrid>
        <Kpi label="On the book" value={guests.length} note="with a profile" />
        <Kpi label="VIPs" value={vips} tone="up" note="tonight" />
        <Kpi label="Stock collisions" value={collisions} tone={collisions ? 'down' : 'flat'} note="favourite is out" />
        <Kpi label="Allergy flags" value={allergyFlags} note="brief the floor" />
      </KpiGrid>

      <SectionTitle note="Predictions come from each guest's own tickets — never invented">
        Tonight's guests
      </SectionTitle>

      {guests.length ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))]">
          {guests.map((g) => <GuestCard key={g.key} g={g} onOpen={setOpen} />)}
        </div>
      ) : (
        <Empty title="Nobody profiled on tonight's book" body="Guests appear here once they have sales tickets on file." />
      )}

      {/* At-table card — the one-tap brief a floor lead reads before greeting the table. */}
      <Modal
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        title={open?.name}
        subtitle={open ? `${open.tier} · ${open.reservation.time} · party of ${open.reservation.party}${open.reservation.table ? ` · table ${open.reservation.table}` : ''}` : null}
        width={560}
        footer={<button className="btn" onClick={() => setOpen(null)}>Close</button>}
      >
        {open && (
          <>
            <div className="card !shadow-none p-4 mb-3" style={{ background: 'var(--accent-soft)' }}>
              <div className="eyebrow mb-1.5 flex items-center gap-1.5"><Sparkle size={12} /> Server script</div>
              <p className="text-[14px] t-ink leading-relaxed">{open.script}</p>
            </div>

            <div className="eyebrow mb-2.5">Likely order</div>
            <div className="flex flex-col gap-3 mb-4">
              {open.likely.map((l) => (
                <div key={l.sku}>
                  <Likely l={l} />
                  <div className="text-[12px] t-mut mt-1">{l.seen}</div>
                </div>
              ))}
            </div>

            {open.suggestion && (
              <div className="card !shadow-none p-4 mb-3" style={{ background: 'var(--raised)' }}>
                <div className="eyebrow mb-1.5">Worth offering</div>
                <p className="text-[13px] t-ink">
                  Hasn't ordered <strong>{open.suggestion.name}</strong> — in stock, and in a category they already buy.
                </p>
              </div>
            )}

            {open.allergies.length > 0 && (
              <div className="card !shadow-none p-4 mb-3"
                style={{ background: 'color-mix(in oklab, var(--red) 8%, transparent)', borderColor: 'color-mix(in oklab, var(--red) 35%, transparent)' }}>
                <div className="eyebrow mb-1.5" style={{ color: 'var(--red)' }}>Allergies and restrictions</div>
                <p className="text-[13px] t-ink">{open.allergies.join(' · ')}</p>
              </div>
            )}

            {open.notes && (
              <div className="mb-3">
                <div className="eyebrow mb-1.5">Notes</div>
                <p className="text-[13px] t-mut leading-relaxed">{open.notes}</p>
              </div>
            )}

            <div className="text-[12.5px] t-mut pt-3" style={{ borderTop: '1px solid var(--border)' }}>
              {open.visits} visits on file
              {open.lastVisitDays !== null && <> · last in {open.lastVisitDays === 0 ? 'today' : open.lastVisitDays === 1 ? 'yesterday' : `${open.lastVisitDays} days ago`}</>}
              {' '}· average check {money(open.avgCheck)} · grounded in {open.grounding}
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
