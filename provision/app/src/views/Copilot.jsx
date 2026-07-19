import { useState, useRef, useEffect } from 'react';
import { askCopilot } from '../lib/api.js';
import { Sparkle, X, ArrowUp } from '../components/icons.jsx';
import Markdown from '../components/Markdown.jsx';

// komodos-chat-ui: rendered Markdown answers, typing indicator AND a send spinner, message
// entrance motion, pill ask-bar with a circular send. The user is never left guessing.
const SUGGEST = [
  'What is about to run out?',
  'Who is booked tonight?',
  'What is waiting on my approval?',
  'Where is cash sitting still?',
];

export default function Copilot({ open, onClose, venue }) {
  const [msgs, setMsgs] = useState([{
    role: 'assistant',
    content: 'Ask me about what is running low, what is on order, who is on the book tonight, or where cash is sitting still.',
  }]);
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState(null);
  const [input, setInput] = useState('');
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, busy, open]);

  async function send(text) {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    setInput('');
    const next = [...msgs, { role: 'user', content: t }];
    setMsgs(next);
    setBusy(true);
    try {
      const turns = next.slice(1).map((m) => ({ role: m.role, content: m.content })); // drop the greeting
      const { reply, live, engine: eng } = await askCopilot(turns, { venue });
      setEngine(live ? eng : 'grounded');
      setMsgs((m) => [...m, { role: 'assistant', content: reply }]);
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: 'Could not reach the co-pilot. Is the backend running?' }]);
    } finally {
      setBusy(false);
    }
  }

  const badge = engine === null ? 'reads your live records'
    : engine === 'grounded' ? 'grounded · connect Runtype for live AI'
    : `live · ${engine}`;

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
            <div className="eyebrow mt-1.5 truncate">{badge}</div>
          </div>
          <button className="btn !px-2.5 !py-2" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-auto px-4 py-4 aichat">
          <div className="log">
            {msgs.map((m, i) => (
              m.role === 'user'
                ? <div key={i} className="msg user">{m.content}</div>
                : <div key={i} className="msg ai"><Markdown>{m.content}</Markdown></div>
            ))}
            {busy && <div className="msg ai typing"><span className="dots"><i /><i /><i /></span></div>}
          </div>
        </div>

        <div className="p-3 aichat" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {SUGGEST.map((s) => (
              <button key={s} className="badge" style={{ cursor: 'pointer' }} onClick={() => send(s)}>{s}</button>
            ))}
          </div>
          <form className="bar" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your co-pilot…" aria-label="Message" />
            <button type="submit" className={`send ${busy ? 'sending' : ''}`} disabled={busy || !input.trim()} aria-label="Send">
              {busy ? <span className="spin" /> : <ArrowUp size={16} />}
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
