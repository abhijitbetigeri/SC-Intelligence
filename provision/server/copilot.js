// Co-pilot — one entry point, four possible engines, always an answer.
//
//   1. Runtype agent (when RUNTYPE_TOKEN is set)        — the production agent path
//   2. InsForge Model Gateway (when INSFORGE_* is set)  — the gateway path
//   3. Anthropic direct (when ANTHROPIC_API_KEY is set) — a real model call
//   4. Grounded fallback (always available)             — deterministic, reads the REAL
//      stock board and guest predictions. Never invents a number.
//
// Engines 1–3 are all given the SAME grounding context (see groundingContext below): a
// compact snapshot of the live records. The model answers over real data rather than from
// memory, which is what keeps "never invent a number" true even once an LLM is in the loop.
//
// The fallback is not a toy: it keeps the app fully demoable with nothing connected, and it
// reads the same records the UI shows, so it cannot contradict the screen next to it.
import Anthropic from '@anthropic-ai/sdk';
import { insforge, runtype, logSeam } from './seams.js';
import { stockBoard, tonightsGuests } from './forecast.js';
import { records } from './records.js';

// The komodos-chat-ui answer-formatting block, appended to every system prompt.
export const FORMAT_BLOCK = `Lead with the direct answer in one or two sentences; only expand if the question
needs it. Format as clean, concise Markdown: short paragraphs, bullet lists ONLY
when they genuinely aid scanning (not for every answer), inline \`code\` for code
and identifiers, fenced blocks for multi-line code, and bold key terms sparingly.
Do not restate the question or open with filler like "Based on the provided
content" — just answer. If you don't know, or the source doesn't cover it, say so
in one line.`;

export function systemPrompt({ role, venue }) {
  return [
    `You are the Komodos Provision co-pilot for ${venue || 'the venue'}, speaking to its ${role || 'operator'}.`,
    'You cover two things: the supply chain (stock, par levels, suppliers, purchase orders, receiving) and the guests (regulars, VIPs, likely orders).',
    'Ground every claim in the data you are given. Never invent a number, a supplier price, or a guest preference.',
    'Purchase orders and guest data never leave the building without an operator approving them — say so if asked to send something.',
    '',
    FORMAT_BLOCK,
  ].join('\n');
}

// ── grounding context ────────────────────────────────────────────────────────
// A compact snapshot of the live records, handed to whichever model engine runs. Kept small
// and pre-computed (days of cover, status, confidence already derived) so the model reports
// numbers rather than deriving — or inventing — them.
export function groundingContext() {
  const board = stockBoard();
  return {
    venue: 'Above Eleven',
    stock: {
      counts: board.counts,
      stockValue: board.stockValue,
      items: board.rows.map((r) => ({
        name: r.name, category: r.category, unit: r.unit,
        onHand: r.onHand, onOrder: r.onOrder, par: r.par,
        perDay: r.dailyAvg, daysOfCover: r.daysOfCover,
        leadTimeDays: r.leadTimeDays, supplier: r.supplier, status: r.status,
      })),
    },
    purchaseOrders: records.list('po').map((p) => ({
      id: p.id, stage: p.stage, item: p.itemName, qty: p.qty,
      supplier: p.supplier, total: p.total, channel: p.channel || null,
    })),
    tonight: tonightsGuests().map((g) => ({
      name: g.name, tier: g.tier, time: g.reservation.time, party: g.reservation.party,
      visits: g.visits, grounding: g.grounding, allergies: g.allergies,
      likely: g.likely.map((l) => ({ name: l.name, confidence: l.confidence, inStock: l.inStock })),
      suggestion: g.suggestion?.name || null,
    })),
  };
}

// ── grounded fallback ────────────────────────────────────────────────────────
const money = (n) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

function groundedAnswer(question) {
  const q = String(question || '').toLowerCase();
  const board = stockBoard();
  const critical = board.rows.filter((r) => r.status === 'critical');
  const low = board.rows.filter((r) => r.status === 'low');

  const asks = (...words) => words.some((w) => q.includes(w));

  if (asks('critical', 'run out', 'stockout', '86', 'urgent')) {
    if (!critical.length) return 'Nothing is critical right now — every item has more days of cover than its supplier lead time.';
    const list = critical.slice(0, 5)
      .map((r) => `- **${r.name}** — ${r.onHand} ${r.unit}${r.onHand === 1 ? '' : 's'} on hand, ${r.daysOfCover} days of cover against a ${r.leadTimeDays}-day lead from ${r.supplier}`)
      .join('\n');
    return `${critical.length} item${critical.length === 1 ? '' : 's'} will run out before a delivery could land:\n\n${list}\n\nEach one has a drafted PO waiting on the stock board.`;
  }

  if (asks('order', 'reorder', 'purchase', 'po', 'supplier', 'buy')) {
    const pos = records.list('po');
    const drafts = pos.filter((p) => p.stage === 'draft');
    const sent = pos.filter((p) => p.stage === 'sent');
    if (!pos.length) return 'No purchase orders yet. The stock board drafts one for any item below its reorder point — you approve before anything is sent.';
    return `There ${pos.length === 1 ? 'is' : 'are'} ${pos.length} purchase order${pos.length === 1 ? '' : 's'} on file: **${drafts.length} awaiting your approval**, ${sent.length} sent.${drafts.length ? ` The drafts total ${money(drafts.reduce((s, p) => s + (p.total || 0), 0))}.` : ''}`;
  }

  if (asks('vip', 'tonight', 'guest', 'booked', 'reservation', 'regular')) {
    const guests = tonightsGuests();
    if (!guests.length) return 'Nobody on the books tonight has a guest profile yet.';
    const list = guests.slice(0, 4)
      .map((g) => `- **${g.name}** (${g.tier}, ${g.reservation.time}, party of ${g.reservation.party}) — likely ${g.likely[0]?.name || 'no clear favourite'}${g.allergies.length ? ` · ${g.allergies.join('; ')}` : ''}`)
      .join('\n');
    return `${guests.length} profiled guest${guests.length === 1 ? '' : 's'} on the book tonight:\n\n${list}\n\nEach card carries a one-line script and the tickets the prediction came from.`;
  }

  if (asks('value', 'worth', 'cash', 'tied up', 'capital')) {
    return `You are holding ${money(board.stockValue)} of stock across ${board.rows.length} tracked items — ${board.counts.critical} critical, ${board.counts.low} below reorder point, ${board.counts.ok} healthy.`;
  }

  if (asks('slow', 'dead', 'not selling', 'overstocked')) {
    const dead = board.rows.filter((r) => r.dailyAvg < 0.35 && r.onHand > r.reorderPoint)
      .sort((a, b) => b.onHand * b.unitCost - a.onHand * a.unitCost).slice(0, 4);
    if (!dead.length) return 'Nothing is sitting still — every tracked item is moving at a reasonable rate.';
    return `Slowest movers by cash on the shelf:\n\n${dead.map((r) => `- **${r.name}** — ${r.onHand} ${r.unit}s (${money(r.onHand * r.unitCost)}) moving ${r.dailyAvg}/day`).join('\n')}`;
  }

  return [
    `${board.counts.critical} item${board.counts.critical === 1 ? '' : 's'} critical, ${board.counts.low} below reorder point, ${money(board.stockValue)} of stock on hand, and ${tonightsGuests().length} profiled guests on tonight's book.`,
    '',
    'Ask me about what is running out, what is on order, who is booked tonight, or where cash is sitting still.',
  ].join('\n');
}

// ── Anthropic direct ─────────────────────────────────────────────────────────
// A real model call over the grounding context. Off unless ANTHROPIC_API_KEY is set, so the
// app still runs disconnected.
export const anthropicConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);
// claude-opus-4-8 is the default; override with ANTHROPIC_MODEL.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

let _client = null;
const anthropic = () => (_client ||= new Anthropic()); // reads ANTHROPIC_API_KEY from env

async function askAnthropic(messages, ctx) {
  const client = anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    // Adaptive thinking is NOT on when the field is omitted on Opus 4.8 — set it explicitly.
    // `low` effort suits short grounded lookups and keeps the drawer responsive; without
    // thinking on, 4.8 tends to write its reasoning into the visible answer.
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    // No temperature/top_p/top_k — those are removed on Opus 4.8 and return a 400.
    system: [
      { type: 'text', text: systemPrompt(ctx) },
      {
        type: 'text',
        text: `Current data for ${ctx.venue || 'the venue'} (this is the ONLY source of truth — `
          + 'every number you state must come from it; if it is not here, say you do not have it):\n'
          + JSON.stringify(groundingContext()),
        // No cache_control here on purpose: system prompt + snapshot is ~1.5k tokens, and
        // Opus 4.8's minimum cacheable prefix is 4096. A breakpoint below the minimum is
        // silently ignored (cache_creation_input_tokens stays 0) — a marker that looks like
        // an optimization and does nothing is worse than no marker. Revisit if the snapshot
        // grows past ~4k (more branches, ticket history) or the model changes.
      },
    ],
    messages,
  });

  // Narrow the content union — thinking blocks precede text on an adaptive-thinking response.
  const reply = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  if (res.stop_reason === 'refusal') throw new Error('model declined the request');
  if (!reply) throw new Error('empty response');
  return reply;
}

// ── entry point ──────────────────────────────────────────────────────────────
export async function askCopilot(messages, ctx = {}) {
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content || '';

  // 1. Runtype agent
  try {
    const viaAgent = await runtype.invoke('copilot', { messages, system: systemPrompt(ctx) });
    if (viaAgent?.reply) return { reply: viaAgent.reply, live: true, engine: 'runtype' };
  } catch { /* fall through */ }

  // 2. InsForge Model Gateway
  try {
    const viaGateway = await insforge.chat(
      [{ role: 'system', content: systemPrompt(ctx) }, ...messages],
      { model: process.env.INSFORGE_MODEL || MODEL },
    );
    if (viaGateway?.reply) return { reply: viaGateway.reply, live: true, engine: 'insforge' };
  } catch { /* fall through */ }

  // 3. Anthropic direct. Typed SDK errors, most specific first — a rate limit or an outage
  // must not take the co-pilot down, so every failure degrades to the grounded answer.
  if (anthropicConfigured()) {
    try {
      return { reply: await askAnthropic(messages, ctx), live: true, engine: `anthropic:${MODEL}` };
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) logSeam('anthropic', 'rate limited — using grounded fallback');
      else if (e instanceof Anthropic.AuthenticationError) logSeam('anthropic', 'ANTHROPIC_API_KEY rejected — using grounded fallback');
      else if (e instanceof Anthropic.APIConnectionError) logSeam('anthropic', 'connection failed — using grounded fallback');
      else if (e instanceof Anthropic.APIError) logSeam('anthropic', `API error ${e.status} — using grounded fallback`);
      else logSeam('anthropic', `${e.message} — using grounded fallback`);
    }
  }

  // 4. Grounded fallback
  return { reply: groundedAnswer(last), live: false, engine: 'grounded' };
}

export const copilotReady = () =>
  runtype.configured() || insforge.configured() || anthropicConfigured();

// ── streaming ────────────────────────────────────────────────────────────────
// Persona speaks SSE, so the drawer needs a token stream rather than one JSON blob. The
// engine ladder above is unchanged: only the Anthropic path can stream natively. Every other
// engine — including the grounded fallback — resolves a full answer and is then chunked here.
//
// That chunking is a PRESENTATION choice, not a claim about the engine: the `done` event
// carries `streamed` so the client can tell a real token stream from a replayed one. We do
// not pretend a deterministic local answer arrived token-by-token from a model.
const CHUNK_MS = 12;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Split on whitespace boundaries so Markdown never tears mid-token (a chunk ending inside
// `**bo` would render as literal asterisks in the client's incremental parse).
function* chunked(text) {
  const parts = text.match(/\S+\s*/g) || [];
  for (const p of parts) yield p;
}

export async function* streamCopilot(messages, ctx = {}) {
  // Real token streaming, only when Anthropic is the live engine.
  if (anthropicConfigured()) {
    try {
      const stream = anthropic().messages.stream({
        model: MODEL,
        max_tokens: 4096,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
        system: [
          { type: 'text', text: systemPrompt(ctx) },
          {
            type: 'text',
            text: `Current data for ${ctx.venue || 'the venue'} (this is the ONLY source of truth — `
              + 'every number you state must come from it; if it is not here, say you do not have it):\n'
              + JSON.stringify(groundingContext()),
          },
        ],
        messages,
      });
      let any = false;
      // Iterating a MessageStream yields raw SSE events, not strings. Match only `text_delta`
      // so adaptive-thinking deltas never reach the drawer — `display` defaults to `omitted`
      // on Opus 4.8, so those blocks carry empty text anyway, but matching explicitly means a
      // future `display: summarized` cannot leak reasoning into the answer.
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta' && ev.delta.text) {
          any = true;
          yield { type: 'delta', text: ev.delta.text };
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') throw new Error('model declined the request');
      if (!any) {
        const reply = final.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        if (!reply) throw new Error('empty response');
        for (const c of chunked(reply)) { yield { type: 'delta', text: c }; await sleep(CHUNK_MS); }
      }
      yield { type: 'done', engine: `anthropic:${MODEL}`, live: true, streamed: true };
      return;
    } catch (e) {
      logSeam('anthropic', `stream failed (${e.message}) — using the non-streaming ladder`);
      // fall through to the shared ladder rather than failing the request
    }
  }

  // Every other engine: resolve fully, then replay as chunks.
  const { reply, live, engine } = await askCopilot(messages, ctx);
  for (const c of chunked(reply)) { yield { type: 'delta', text: c }; await sleep(CHUNK_MS); }
  yield { type: 'done', engine, live, streamed: false };
}
