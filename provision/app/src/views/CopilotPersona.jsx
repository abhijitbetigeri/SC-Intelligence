import { useEffect, useRef } from 'react';
import initAgentWidget from '@runtypelabs/persona';
// Persona ships its stylesheet as a separate export and does NOT inject it. Without this the
// widget renders correct markup with zero CSS — right classes, no rules — and every theme token
// is silently inert. It must be imported into the document, which in turn is why the widget
// mounts in the light DOM below: a document stylesheet cannot cross a shadow boundary. Safe to
// share the page because every Persona class carries a `persona-` prefix.
import '@runtypelabs/persona/widget.css';
import { Sparkle, X } from '../components/icons.jsx';
import { personaTheme, KOMODOS } from '../lib/personaTheme.js';
import { API_BASE } from '../lib/api.js';
import { getToken } from '../lib/auth.js';

// The co-pilot drawer, rendered by Persona (@runtypelabs/persona) — Runtype's own agent-UI
// library, so the chat surface is first-party to the agent runtime this product graduates onto.
//
// Division of labour: the drawer shell, header, and theme cycle stay ours (komodos-ui); Persona
// owns only the transcript and composer, themed through `personaTheme()`. Persona's launcher and
// header are both disabled — we already have a better-integrated version of each.
//
// The backend is OURS, not Runtype's cloud: `customFetch` points every turn at
// /api/copilot/stream, so the drawer keeps working with nothing configured. Graduating to a real
// Runtype agent later means setting `agentId` and dropping `customFetch` — the theme, the
// composer, and every call site stay exactly as they are.

const SUGGEST = [
  'What is about to run out?',
  'Who is booked tonight?',
  'What is waiting on my approval?',
  'Where is cash sitting still?',
];

// Our SSE frames → Persona's parser result. `text` appends to the live bubble; `done` closes it.
function parseSSEEvent(eventData) {
  if (eventData == null) return null;
  let d = eventData;
  if (typeof d === 'string') {
    const s = d.trim();
    if (!s) return null;
    if (s === '[DONE]') return { done: true };
    try { d = JSON.parse(s); } catch { return { text: s }; }
  }
  if (d.type === 'delta') return { text: d.text || '' };
  if (d.type === 'done') return { done: true };
  if (d.type === 'error') return { error: d.error || 'The co-pilot could not answer.' };
  return null;
}

// Team wiring: SC-Intelligence's live Runtype agents (account abhijitbetigeri29@gmail.com,
// org org_3Gh0WINGvbGW2609id6p5MXs3JP). The client token is browser-safe and all-origins, and is
// already published in that repo's web/index.html — it is not a secret being leaked here.
//
// Set VITE_RUNTYPE_TOKEN='' to force the local grounded co-pilot. That matters more than usual:
// the team account has already hit `402 Limit Exceeded` on daily executions once, so the local
// engine is the demo's safety net, not a leftover.
const RUNTYPE_TOKEN = import.meta.env.VITE_RUNTYPE_TOKEN
  ?? 'ct_live_01kxvyhr_2055537660436c1136d1cf9c01917237';
const RUNTYPE_AGENT = import.meta.env.VITE_RUNTYPE_AGENT_ID
  ?? 'agent_01kxvyhr7deh585q7x2bprv2gk'; // Inventory Admin
export const usingLiveAgent = Boolean(RUNTYPE_TOKEN && RUNTYPE_AGENT);

function buildConfig(theme, venue) {
  // Live path: Persona talks to Runtype directly. No customFetch, no local endpoint — this is
  // the graduation the drawer was built for, and only the transport changes.
  if (usingLiveAgent) {
    return {
      ...baseConfig(theme),
      apiUrl: 'https://api.runtype.com',
      clientToken: RUNTYPE_TOKEN,
      agentId: RUNTYPE_AGENT,
    };
  }
  return { ...baseConfig(theme), ...localTransport(venue) };
}

// Local demo transport — our own SSE endpoint, grounded in the local records.
function localTransport(venue) {
  return {
    apiUrl: `${API_BASE}/api/copilot/stream`,
    // Persona would otherwise shape the request for Runtype's dispatch API. We answer locally,
    // so take over the transport and translate to the server's {messages, venue} contract.
    customFetch: (url, init, payload) => fetch(url, {
      ...init,
      method: 'POST',
      headers: {
        ...(init?.headers || {}),
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: JSON.stringify({
        venue,
        messages: (payload?.messages || []).map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          // Persona models content as either a string or an array of parts.
          content: typeof m.content === 'string'
            ? m.content
            : (m.content || []).map((p) => p?.text || '').join(''),
        })),
      }),
    }),
    parseSSEEvent,
  };
}

// Everything that is transport-independent: the komodos skin and the chrome decisions.
function baseConfig(theme) {
  return {
    theme: personaTheme(theme),
    colorScheme: KOMODOS[theme]?.scheme || 'light',
    // Our shell already provides the launcher affordance and the header. `fullHeight` is what
    // makes the inline panel stretch to the drawer instead of Persona's default 600px card.
    launcher: { enabled: false, fullHeight: true, width: '100%' },
    layout: {
      showHeader: false,
      showFooter: true,
      // `messages` is an object whose own `layout` key picks the preset — passing the bare
      // string "bubble" here silently does nothing.
      messages: {
        layout: 'bubble',
        groupConsecutive: true,
        avatar: { show: false }, // komodos has no avatar in chat; the header carries identity
      },
    },
    suggestionChips: SUGGEST,
    copy: {
      showWelcomeCard: false,
      inputPlaceholder: 'Ask your co-pilot…',
      sendButtonLabel: 'Send',
    },
    sendButton: { useIcon: true, iconName: 'arrow-up', size: '34px' },
    // Off by default in komodos: a mic is a second affordance competing with the send button,
    // and the browser permission prompt has no place in a service-floor demo.
    voiceRecognition: { enabled: false },
    // "Online" under the composer reads as a connection claim we cannot make honestly in demo
    // mode — the drawer's grounding is stated in the header instead.
    statusIndicator: { visible: false },
    // The grounded fallback has no tools or reasoning to show; leaving these on would render
    // empty chrome. Turn them on when a real Runtype agent is wired up.
    features: { showReasoning: false, showToolCalls: false },
    initialMessages: [{
      role: 'assistant',
      content: 'Ask me about what is running low, what is on order, who is on the book tonight, or where cash is sitting still.',
    }],
  };
}

export default function CopilotPersona({ open, onClose, venue, theme }) {
  const mountRef = useRef(null);
  const ctrlRef = useRef(null);

  // Mount once. Persona owns a Shadow DOM under this node, so React must never re-render into it.
  useEffect(() => {
    if (!mountRef.current || ctrlRef.current) return undefined;
    ctrlRef.current = initAgentWidget({
      target: mountRef.current,
      // Light DOM, paired with the widget.css import above — see that comment.
      useShadowDom: false,
      config: buildConfig(theme, venue),
    });
    return () => { ctrlRef.current?.destroy(); ctrlRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-theme on the host's three-way cycle. Persona has no setTheme — `update` takes a whole
  // config, so rebuild it rather than patching.
  useEffect(() => {
    ctrlRef.current?.update(buildConfig(theme, venue));
  }, [theme, venue]);

  return (
    <>
      <div className={`fixed inset-0 z-[55] transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'color-mix(in oklab, var(--display) 40%, transparent)' }} onClick={onClose} />
      <aside className={`fixed top-0 right-0 h-screen w-[410px] max-w-[94vw] z-[56] flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: 'var(--card)', borderLeft: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 p-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="w-9 h-9 rounded-2xl grid place-items-center t-accent"
            style={{ background: 'var(--accent-soft)' }}><Sparkle size={17} /></div>
          <div className="flex-1 min-w-0">
            <div className="text-[16px] font-bold t-display leading-none">Co-pilot</div>
            <div className="eyebrow mt-1.5 truncate">reads your live records</div>
          </div>
          <button className="btn !px-2.5 !py-2" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        <div ref={mountRef} className="flex-1 min-h-0" />
      </aside>
    </>
  );
}
