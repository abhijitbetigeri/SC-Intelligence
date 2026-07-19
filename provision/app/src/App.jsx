import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Menu, X, Sparkle, ChevronDown, CornerUpLeft, Box, Grid, Users, Shield, Truck } from './components/icons.jsx';
import { health } from './lib/api.js';
import { getTeam, impersonate, endImpersonation, isImpersonating } from './lib/auth.js';
import Overview from './views/Overview.jsx';
import Stock from './views/Stock.jsx';
import Franchise from './views/Franchise.jsx';
import Vips from './views/Vips.jsx';
import Admin from './views/Admin.jsx';
import Copilot from './views/Copilot.jsx';
import CopilotPersona from './views/CopilotPersona.jsx';

// The co-pilot drawer has two implementations behind one prop contract:
//   CopilotPersona — Runtype's Persona widget, skinned to komodos via design tokens (default)
//   Copilot        — the hand-rolled komodos-chat-ui drawer, no third-party runtime
// Persona owns a Shadow DOM and streams over SSE; the fallback is a plain fetch. If the widget
// ever misbehaves mid-demo, flip this one constant and the app keeps working.
const USE_PERSONA = true;
const CopilotDrawer = USE_PERSONA ? CopilotPersona : Copilot;

const VIEWS = { overview: Overview, stock: Stock, franchise: Franchise, vips: Vips, admin: Admin };
const ORDER = ['overview', 'stock', 'franchise', 'vips', 'admin'];
const LABEL = { overview: 'Overview', stock: 'Stock', franchise: 'Franchise', vips: "Tonight's guests", admin: 'Users & access' };
const ICON = { overview: Grid, stock: Box, franchise: Truck, vips: Users, admin: Shield };
const SUBTITLE = {
  overview: 'What needs you, computed from tonight’s numbers',
  stock: 'Par levels, cover, and reorders that draft themselves',
  franchise: 'What the agents decided across every branch, and whether it lands in time',
  vips: 'Who is booked, and what they will probably order',
  admin: 'Seats and the dashboards each role can open',
};
const ROLE_LABEL = { admin: 'Admin', owner: 'Owner-operator', gm: 'General manager', beverage: 'Beverage director', floor: 'Floor lead' };

// Admins can occupy a teammate's seat to demo role-scoped access; one click returns.
function UserSwitcher({ user, compact = false }) {
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState([]);
  const imp = isImpersonating();
  const canSwitch = user.role === 'admin' || imp;
  const initial = (user.name || user.email || '?')[0].toUpperCase();

  useEffect(() => {
    if (open && user.role === 'admin') getTeam().then((x) => x?.team && setTeam(x.team)).catch(() => {});
  }, [open, user.role]);

  const trigger = compact ? (
    <button className="w-9 h-9 rounded-full grid place-items-center kv text-[12px] shrink-0"
      onClick={() => canSwitch && setOpen((v) => !v)} aria-label="Switch user view"
      style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: imp ? '1.5px solid var(--accent)' : '1px solid var(--border)' }}>
      {initial}
    </button>
  ) : (
    <button className="btn !gap-2" onClick={() => canSwitch && setOpen((v) => !v)} aria-label="Switch user view"
      style={imp ? { borderColor: 'var(--accent)' } : {}}>
      <span className="w-6 h-6 rounded-full grid place-items-center text-[11px] kv"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{initial}</span>
      <span className="text-[12.5px] font-semibold t-ink hidden md:block">{user.name || user.email}</span>
      {imp && <span className="badge warn hidden lg:inline">viewing as</span>}
      {canSwitch && <ChevronDown size={13} style={{ color: 'var(--muted)' }} />}
    </button>
  );
  if (!canSwitch) return trigger;

  return (
    <>
      {trigger}
      {open && createPortal(
        <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)}>
          <div className="modal-card absolute right-3 top-16 w-[290px] p-2.5 rise" onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow px-2 py-1.5">Demo · view the platform as</div>
            {imp && (
              <button className="card !p-3 w-full text-left flex items-center gap-2.5 lift mb-1.5"
                style={{ borderColor: 'var(--accent)' }} onClick={endImpersonation}>
                <CornerUpLeft size={16} />
                <span className="text-[13px] t-ink font-semibold flex-1">Return to admin</span>
              </button>
            )}
            {user.role === 'admin' && team.map((t) => (
              <button key={t.id} className="card !p-3 w-full text-left flex items-center gap-2.5 lift mb-1.5"
                onClick={() => impersonate(t.id).catch(() => setOpen(false))}>
                <span className="w-8 h-8 rounded-full grid place-items-center kv text-[11px] shrink-0"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{t.name[0]}</span>
                <span className="flex-1 min-w-0">
                  <span className="text-[13px] t-ink font-medium block truncate">{t.name}</span>
                </span>
                <span className="badge">{ROLE_LABEL[t.role] || t.role}</span>
              </button>
            ))}
            {user.role === 'admin' && !team.length && <div className="text-[12px] t-mut px-2 py-3">Loading teammates…</div>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export default function App({ user, onSignOut }) {
  const allowed = ORDER.filter((d) => (user.dashboards || []).includes(d));
  const [view, setView] = useState(() => {
    const want = new URLSearchParams(location.search).get('view');
    return want && allowed.includes(want) ? want : (allowed[0] || null);
  });
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'light');
  const [api, setApi] = useState(null);
  const [coOpen, setCoOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('provision-theme', theme); } catch { /* ignore */ }
  }, [theme]);
  const THEME_NEXT = { light: 'white', white: 'dark', dark: 'light' };
  const THEME_LABEL = { light: 'Warm', white: 'White', dark: 'Dark' };
  const cycleTheme = () => setTheme((t) => THEME_NEXT[t] || 'light');

  useEffect(() => {
    let on = true;
    health().then((h) => on && setApi(h)).catch(() => on && setApi({ ok: false }));
    return () => { on = false; };
  }, []);

  // An insight CTA routes into the pillar that can act on it.
  const navigate = (target) => {
    if (!allowed.includes(target)) return false;
    setNavOpen(false);
    setView(target);
    return true;
  };

  const current = allowed.includes(view) ? view : allowed[0];
  const Cmp = current ? VIEWS[current] : null;
  const initial = (user.name || user.email || '?')[0].toUpperCase();

  // Honest mode label: demo (nothing connected) vs the connected subsystem.
  const modeChip = api?.ok
    ? (api.mode === 'local' ? 'Demo · local data' : 'Connected')
    : api ? 'API offline' : 'API…';
  const modeColor = api?.ok ? (api.mode === 'local' ? 'var(--warn)' : 'var(--green)') : api ? 'var(--red)' : 'var(--muted)';

  const navList = (onPick) => allowed.map((v) => {
    const Icon = ICON[v];
    return (
      <button key={v} onClick={() => { setView(v); onPick?.(); }}
        className={`nav-item !justify-start gap-2.5 ${current === v ? 'on' : ''}`}>
        <Icon size={16} />
        <span>{LABEL[v]}</span>
      </button>
    );
  });

  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
      {/* desktop sidebar — a floating card of nav pills */}
      <aside className="card m-3 p-4 hidden md:flex flex-col gap-1 md:sticky md:top-3 md:h-[calc(100vh-1.5rem)]">
        <div className="flex items-center gap-2.5 px-2 pb-4">
          <div className="w-9 h-9 rounded-2xl grid place-items-center t-accent"
            style={{ background: 'var(--accent-soft)' }}><Box size={18} /></div>
          <div>
            <div className="text-[16px] font-bold t-display leading-none">Provision</div>
            <div className="eyebrow mt-1.5">Komodos</div>
          </div>
        </div>
        {navList()}
        <div className="mt-auto pt-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 px-1 text-[11.5px] t-mut">
            <span className="dot" style={{ background: modeColor }} />
            <span className="truncate">{modeChip}</span>
          </div>
          {api?.subsystems && (
            <div className="eyebrow px-1 leading-relaxed">
              records {api.subsystems.records} · agents {api.subsystems.agents} · mesh {api.subsystems.mesh}
            </div>
          )}
        </div>
      </aside>

      <main className="min-w-0">
        {/* mobile top bar */}
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-2 px-4 py-2.5"
          style={{ background: 'color-mix(in oklab, var(--bg) 88%, transparent)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
          <button className="btn !px-3 !py-2" onClick={() => setNavOpen(true)} aria-label="Open menu"><Menu size={17} /></button>
          <div className="text-[16px] font-bold t-display flex-1 leading-none">Provision</div>
          <button className="btn primary !px-3 !py-2" onClick={() => setCoOpen(true)} aria-label="Co-pilot"><Sparkle size={15} /></button>
          <UserSwitcher user={user} compact />
        </div>

        <header className="flex items-center gap-3 px-4 md:px-6 pt-5 pb-2 md:py-5 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <h1 className="text-[26px] md:text-[30px] font-semibold t-display leading-tight">
              {current ? LABEL[current] : 'No access'}
            </h1>
            <div className="text-[13px] t-mut mt-1">
              {current ? SUBTITLE[current] : 'No dashboards assigned — ask your admin.'}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2.5 flex-wrap">
            <span className="btn !cursor-default" title="Data source">
              <span className="dot" style={{ background: modeColor }} /> {modeChip}
            </span>
            <button className="btn primary" onClick={() => setCoOpen(true)}><Sparkle size={14} /> Co-pilot</button>
            <UserSwitcher user={user} />
            <button className="btn" onClick={cycleTheme} aria-label="Cycle theme" title={`Theme: ${THEME_LABEL[theme]}`}>
              {THEME_LABEL[theme]}
            </button>
            <button className="btn" onClick={onSignOut}>Sign out</button>
          </div>
        </header>

        <div key={current} className="px-4 md:px-6 pb-16 max-w-[1400px] rise">
          {Cmp ? <Cmp user={user} navigate={navigate} /> : (
            <div className="card p-8 text-center mt-6">
              <h3 className="text-xl t-display mb-2">No dashboards yet</h3>
              <p className="text-[13px] t-mut">Your account has no dashboards assigned. Ask an admin for access.</p>
            </div>
          )}
        </div>
      </main>

      {/* mobile nav drawer */}
      {navOpen && createPortal(
        <div className="md:hidden fixed inset-0 z-[60]" onClick={() => setNavOpen(false)}>
          <div className="absolute inset-0" style={{ background: 'color-mix(in oklab, var(--display) 45%, transparent)' }} />
          <div className="modal-card absolute left-0 top-0 bottom-0 w-[84%] max-w-[320px] flex flex-col p-4 gap-1 overflow-y-auto !rounded-l-none"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-1 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl grid place-items-center t-accent" style={{ background: 'var(--accent-soft)' }}><Box size={18} /></div>
                <div>
                  <div className="text-[16px] font-bold t-display leading-none">Provision</div>
                  <div className="eyebrow mt-1.5">Komodos</div>
                </div>
              </div>
              <button className="btn !px-2.5 !py-1.5" onClick={() => setNavOpen(false)} aria-label="Close menu"><X size={15} /></button>
            </div>
            {navList(() => setNavOpen(false))}
            <div className="mt-auto pt-3 flex flex-col gap-2.5" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 px-1">
                <span className="w-7 h-7 rounded-full grid place-items-center text-[11px] kv shrink-0"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{initial}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold t-ink truncate">{user.name || user.email}</div>
                  <div className="eyebrow">{ROLE_LABEL[user.role] || user.role}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn flex-1" onClick={onSignOut}>Sign out</button>
                <button className="btn" onClick={cycleTheme} aria-label="Cycle theme">{THEME_LABEL[theme]}</button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <CopilotDrawer open={coOpen} onClose={() => setCoOpen(false)} venue={user.venue} theme={theme} />
    </div>
  );
}
