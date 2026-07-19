import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { records, moveStage, PO_STAGES } from './records.js';
import { seedSimulation, VENUE, SEED } from './simulate.js';
import { stockBoard, draftReorder, tonightsGuests, allGuestPredictions, predictForGuest } from './forecast.js';
import { computeInsights, overviewKpis } from './insights.js';
import { dispatchReorder, reorderChannel, ruleAllowsSend, RULE_MODES } from './purchasing.js';
import { subsystemModes, recentSeamCalls, cotal, RUNTYPE_AGENTS } from './seams.js';
import { askCopilot, streamCopilot, copilotReady } from './copilot.js';
import { franchiseSnapshot, miseMode } from './mise.js';
import { userStore, seedUsers } from './userStore.js';
import { signToken, verifyToken, verifyPassword, publicUser, ROLES } from './auth.js';

const app = express();
const PORT = process.env.PORT || 8788;
app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','), allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());

seedUsers();               // idempotent demo directory so login works out of the box
const sim = seedSimulation(); // idempotent suppliers / items / guests / 60 days of tickets

// ── auth ─────────────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  const payload = m && verifyToken(m[1]);
  const user = payload && userStore.raw(payload.sub);
  if (!user || !user.active) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  next();
}
const requireAdmin = (req, res, next) =>
  req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'forbidden' });
const actorOf = (req) => req.user?.name || req.user?.email || 'operator';

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = userStore.byEmail(email);
  if (!u || !u.active || !verifyPassword(password, u.passwordHash)) {
    return res.status(401).json({ error: 'invalid email or password' });
  }
  res.json({ token: signToken({ sub: u.id, role: u.role }), user: publicUser(u) });
});
app.get('/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

// Demo "view as" — an admin can occupy any teammate's seat to show role-scoped access.
app.get('/api/team', requireAuth, requireAdmin, (req, res) =>
  res.json({ team: userStore.list().filter((u) => u.id !== req.user.id) }));
app.post('/admin/users/:id/impersonate', requireAuth, requireAdmin, (req, res) => {
  const target = userStore.raw(req.params.id);
  if (!target) return res.status(404).json({ error: 'not found' });
  res.json({ token: signToken({ sub: target.id, role: target.role }), user: publicUser(target) });
});

// ── health — every subsystem reports local vs connected, honestly ────────────
app.get('/api/health', (req, res) => res.json({
  ok: true,
  service: 'provision-server',
  venue: VENUE,
  mode: subsystemModes().records === 'local' ? 'local' : 'connected',
  subsystems: subsystemModes(),
  reorderChannel: reorderChannel(),
  copilot: copilotReady() ? 'live' : 'grounded-fallback',
  franchise: miseMode(),
  simulation: { seed: SEED, ...sim },
  agents: RUNTYPE_AGENTS.map((a) => a.key),
}));

// Seam call log — what the app WOULD have sent to InsForge / Runtype / Cotal.
app.get('/api/seams', requireAuth, (req, res) => res.json({ calls: recentSeamCalls() }));

// ── overview ─────────────────────────────────────────────────────────────────
app.get('/api/overview', requireAuth, (req, res) =>
  res.json({ kpis: overviewKpis(), insights: computeInsights(), venue: VENUE }));

// ── stock ────────────────────────────────────────────────────────────────────
app.get('/api/stock', requireAuth, (req, res) => {
  const board = stockBoard();
  res.json({ ...board, rule: reorderRule(), stages: PO_STAGES });
});

// Draft a reorder for one SKU. This ALWAYS produces a PO record in `draft` — nothing is
// dispatched here. The operator (or an auto-send rule) moves it to `sent` in the next route.
app.post('/api/stock/:sku/reorder', requireAuth, async (req, res) => {
  const item = records.list('item').find((i) => i.sku === req.params.sku);
  if (!item) return res.status(404).json({ error: 'unknown sku' });
  const draft = draftReorder(item);
  if (!draft) return res.status(422).json({ error: 'no supplier carries this item' });

  // The par sweep multicasts low-stock on Cotal; a reorder-agent picks it up by anycast.
  // Both are no-ops that log until COTAL_* is configured.
  await cotal.multicast('purchasing', 'low-stock', { sku: item.sku, onHand: item.onHand });
  await cotal.anycast('reorder-agent', 'draft-po', { sku: item.sku });

  const po = records.create('po', {
    stage: 'draft',
    venue: VENUE,
    itemId: item.id,
    sku: draft.sku,
    itemName: draft.itemName,
    unit: draft.unit,
    supplier: draft.supplier,
    supplierId: draft.supplierId,
    leadTimeDays: draft.leadTimeDays,
    qty: draft.qty,
    unitCost: draft.unitCost,
    total: draft.total,
    currency: draft.currency,
    forecast: draft.forecast,
    why: draft.why,
    history: [{ from: null, to: 'draft', at: new Date().toISOString(), by: actorOf(req) }],
  }, actorOf(req));

  // If the operator set an auto-send rule and this clears the ceiling, dispatch immediately.
  const rule = reorderRule();
  const gate = ruleAllowsSend(rule, po);
  if (gate.send) {
    const sent = await sendPO(po, `${actorOf(req)} (rule)`);
    return res.json({ po: sent.po, draft, dispatched: sent.dispatch, autoSent: true, reason: gate.reason });
  }
  res.json({ po, draft, dispatched: null, autoSent: false, reason: gate.reason });
});

// Approve + dispatch. The ONLY route that lets a PO leave the building.
app.post('/api/po/:id/approve', requireAuth, async (req, res) => {
  const po = records.get(req.params.id);
  if (!po || po.type !== 'po') return res.status(404).json({ error: 'not found' });
  if (po.stage !== 'draft') return res.status(409).json({ error: `already ${po.stage}` });
  const sent = await sendPO(po, actorOf(req));
  res.json({ po: sent.po, dispatched: sent.dispatch });
});

app.get('/api/pos', requireAuth, (req, res) => res.json({ pos: records.list('po'), stages: PO_STAGES }));

app.post('/api/po/:id/cancel', requireAuth, (req, res) => {
  const po = records.get(req.params.id);
  if (!po || po.type !== 'po') return res.status(404).json({ error: 'not found' });
  if (po.stage !== 'draft') return res.status(409).json({ error: `cannot cancel a ${po.stage} order` });
  records.remove(po.id);
  res.json({ ok: true });
});

// Shared dispatch path: supervised route → approval → supplier channel → mark on-order.
async function sendPO(po, by) {
  await cotal.unicast('approval-agent', 'po-approved', { poId: po.id, total: po.total });
  const dispatch = await dispatchReorder({ ...po, venue: VENUE, approvedBy: by });
  const updated = moveStage(po.id, 'sent', by);
  records.update(po.id, { channel: dispatch.channel, sentAt: new Date().toISOString(), approvedBy: by });
  const item = records.get(po.itemId);
  if (item) records.update(item.id, { onOrder: (item.onOrder || 0) + po.qty });
  return { po: records.get(po.id) || updated, dispatch };
}

// ── reorder rules — the autonomy dial ────────────────────────────────────────
const DEFAULT_RULE = { mode: 'notify', maxTotal: 250 };
function reorderRule() {
  const r = records.list('rule').find((x) => x.key === 'reorder');
  return r ? { mode: r.mode, maxTotal: r.maxTotal } : DEFAULT_RULE;
}
app.get('/api/rules/reorder', requireAuth, (req, res) => res.json({ rule: reorderRule(), modes: RULE_MODES }));
app.put('/api/rules/reorder', requireAuth, (req, res) => {
  const { mode, maxTotal } = req.body || {};
  if (!RULE_MODES.includes(mode)) return res.status(400).json({ error: 'invalid mode' });
  const existing = records.list('rule').find((x) => x.key === 'reorder');
  const patch = { key: 'reorder', mode, maxTotal: Number(maxTotal) || 0 };
  const saved = existing ? records.update(existing.id, patch) : records.create('rule', patch, actorOf(req));
  res.json({ rule: { mode: saved.mode, maxTotal: saved.maxTotal } });
});

// ── guests ───────────────────────────────────────────────────────────────────
app.get('/api/vips', requireAuth, async (req, res) => {
  const guests = tonightsGuests();
  await cotal.multicast('floor', 'vip-arriving', { count: guests.length });
  res.json({ guests, venue: VENUE });
});
app.get('/api/guests', requireAuth, (req, res) => res.json({ guests: allGuestPredictions() }));
app.get('/api/guests/:id', requireAuth, (req, res) => {
  const g = records.get(req.params.id);
  if (!g || g.type !== 'guest') return res.status(404).json({ error: 'not found' });
  res.json({ guest: predictForGuest(g) });
});

// ── franchise (Mise) — read-only owner dashboard over the team's agent layer ──
// Renders what the Mise agents decided, with days-of-cover analysis layered on top.
// Never writes, so it cannot conflict with the agent layer.
app.get('/api/franchise', requireAuth, async (req, res) => {
  try {
    res.json(await franchiseSnapshot());
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

// ── co-pilot ─────────────────────────────────────────────────────────────────
app.post('/api/copilot', requireAuth, async (req, res) => {
  const { messages, message, venue } = req.body || {};
  const msgs = Array.isArray(messages) && messages.length
    ? messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }))
    : (message ? [{ role: 'user', content: String(message) }] : null);
  if (!msgs) return res.status(400).json({ error: 'message required' });
  try {
    res.json(await askCopilot(msgs, { role: req.user.role, venue: venue || VENUE }));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Streaming variant of the same co-pilot. Persona speaks SSE, so the drawer reads this while
// `/api/copilot` stays available for anything non-streaming. Auth is the usual Bearer header —
// Persona fetches this via `customFetch`, not EventSource, so the header survives.
app.post('/api/copilot/stream', requireAuth, async (req, res) => {
  const { messages, message, venue } = req.body || {};
  const msgs = Array.isArray(messages) && messages.length
    ? messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }))
    : (message ? [{ role: 'user', content: String(message) }] : null);
  if (!msgs) return res.status(400).json({ error: 'message required' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // don't let a reverse proxy buffer the stream into one chunk
  });
  res.flushHeaders(); // writeHead alone only stages them; the client should see 200 immediately
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  // If the operator closes the drawer mid-answer, stop generating rather than writing into a
  // dead socket. This MUST hang off `res`, not `req`: `req`'s close fires as soon as the
  // request body has been read (express.json() consumes it immediately), which would abort
  // every stream before its first chunk.
  let closed = false;
  res.on('close', () => { closed = true; });

  try {
    for await (const chunk of streamCopilot(msgs, { role: req.user.role, venue: venue || VENUE })) {
      if (closed) return;
      send(chunk);
    }
  } catch (e) {
    // The ladder already degrades to the grounded answer, so reaching here means something
    // unexpected. Report it in-band: the stream is already 200, so a status code is not an option.
    send({ type: 'error', error: String(e.message || e) });
  } finally {
    if (!closed) { res.write('data: [DONE]\n\n'); res.end(); }
  }
});

// ── serve the built SPA same-origin ──────────────────────────────────────────
// When app/dist exists (vite build), this ONE process serves both the SPA and the API on one
// port. API routes above win; everything else falls back to index.html for the client router.
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app/dist');
const hasSpa = fs.existsSync(path.join(DIST, 'index.html'));
if (hasSpa) {
  app.use(express.static(DIST));
  app.get('*', (req, res, next) => {
    if (/^\/(api|auth|admin)\b/.test(req.path)) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

app.listen(PORT, () => {
  const m = subsystemModes();
  console.log(`[provision] http://localhost:${PORT} · spa=${hasSpa} · records=${m.records} · agents=${m.agents} · mesh=${m.mesh} · llm=${m.llm}`);
});
