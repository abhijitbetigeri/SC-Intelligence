// Shared komodos-ui kit — the recipes every view composes from. Cards float and never share
// a hairline grid; the only uppercase is the 11px micro-label.
import { createPortal } from 'react-dom';
import { X } from './icons.jsx';

export function SectionTitle({ children, note, className = '' }) {
  return (
    <div className={`flex items-baseline gap-3 flex-wrap mt-8 mb-4 ${className}`}>
      <h2 className="text-xl font-semibold t-display">{children}</h2>
      {note && <span className="text-[12px] t-mut">{note}</span>}
    </div>
  );
}

export function KpiGrid({ children }) {
  return <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">{children}</div>;
}

// tone: 'up' | 'down' | 'flat' — direction means GOODNESS, not sign.
export function Kpi({ label, value, note, tone = 'flat' }) {
  const color = tone === 'up' ? 'var(--green)' : tone === 'down' ? 'var(--red)' : 'var(--muted)';
  return (
    <div className="card px-[18px] py-4">
      <div className="kv text-[28px] leading-none">{value}</div>
      <div className="eyebrow mt-2.5">{label}</div>
      {note && <div className="text-[12px] mt-1.5" style={{ color }}>{note}</div>}
    </div>
  );
}

export function Badge({ children, kind, className = '' }) {
  return <span className={`badge ${kind || ''} ${className}`}>{children}</span>;
}

// Status dot — green healthy, amber watch, red act now. Red is risk only.
export function Dot({ status }) {
  const cls = status === 'critical' ? 'bad' : status === 'low' ? 'warn' : 'ok';
  return <span className={`dot ${cls}`} />;
}

export function Switch({ checked, onChange, label }) {
  return (
    <label className="switch" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
    </label>
  );
}

export function Progress({ pct, tone }) {
  const color = tone === 'critical' ? 'var(--red)' : tone === 'low' ? 'var(--warn)' : 'var(--accent)';
  return (
    <div className="ptrack">
      <i style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export function Empty({ title, body }) {
  return (
    <div className="card p-8 text-center">
      <h3 className="text-lg t-display mb-1.5">{title}</h3>
      {body && <p className="text-[13px] t-mut">{body}</p>}
    </div>
  );
}

// Dialog — opaque surface floating over a dimmed page.
export function Modal({ open, onClose, title, subtitle, children, footer, width = 620 }) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in oklab, var(--display) 45%, transparent)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}>
      <div className="modal-card w-full max-h-[86vh] overflow-auto rise" style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-start gap-3 p-5 sticky top-0 z-10"
          style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg t-display">{title}</h3>
            {subtitle && <div className="text-[12.5px] t-mut mt-0.5">{subtitle}</div>}
          </div>
          <button className="btn !px-2.5 !py-2" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        <div className="p-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 sticky bottom-0"
            style={{ background: 'var(--card)', borderTop: '1px solid var(--border)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Insight card — the feed item. Severity is the alert axis (red = act now).
const SEV_LABEL = { red: 'High priority', yellow: 'Worth a look', green: 'Opportunity' };
const SEV_COLOR = { red: 'var(--red)', yellow: 'var(--warn)', green: 'var(--green)' };

export function InsightCard({ x, onAct }) {
  return (
    <div className="card p-[17px] flex flex-col lift">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-2 h-2 rounded-full shrink-0" title={SEV_LABEL[x.severity]}
          style={{ background: SEV_COLOR[x.severity] || 'var(--muted)' }} />
        <span className="eyebrow">{x.label}</span>
      </div>
      <h3 className="text-[16.5px] font-semibold t-display leading-snug mb-1.5">{x.title}</h3>
      <p className="text-[13px] t-mut mb-3 leading-relaxed">{x.body}</p>
      <div className="text-[12.5px] t-accent font-semibold mb-3.5">{x.impact}</div>
      <button className="btn primary self-start mt-auto" onClick={() => onAct?.(x)}>{x.cta}</button>
    </div>
  );
}
