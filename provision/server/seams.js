// Integration seams — InsForge (data plane), Runtype (agent runtime), Cotal (agent mesh).
//
// Every one of these is ENV-GATED and OFF by default. With nothing configured the app is
// fully functional: local JSON records, heuristic forecasts, grounded-fallback AI. Each seam
// logs exactly what it WOULD have called, so the graduation path is visible while you demo.
//
//   InsForge = state / auth / files / LLM gateway   (agent ↔ backend)
//   Runtype  = individual agents + tools + schedules (agent ↔ tools, over MCP)
//   Cotal    = many agents coordinating              (agent ↔ agents, over NATS)
//
// Graduation order (see docs/ARCHITECTURE.md): records → InsForge Postgres, auth → InsForge
// Auth, files → Storage, LLM → Model Gateway, then agents onto Runtype, then Cotal once
// there is more than one agent to coordinate.

const seamLog = [];
export function logSeam(seam, detail) {
  const entry = { at: new Date().toISOString(), seam, detail };
  seamLog.push(entry);
  if (seamLog.length > 200) seamLog.shift();
  console.log(`[seam:${seam}] ${detail}`);
  return entry;
}
export const recentSeamCalls = (n = 25) => seamLog.slice(-n).reverse();

// ── InsForge — backend / data plane ──────────────────────────────────────────
export const insforge = {
  configured: () => Boolean(process.env.INSFORGE_URL && process.env.INSFORGE_KEY),
  mode() { return this.configured() ? 'connected' : 'local'; },
  // Records → Postgres. The records repository is the ONLY caller; swapping the driver here
  // changes nothing upstream.
  async query(sql, params = []) {
    if (!this.configured()) return logSeam('insforge.postgres', `would query: ${sql}`) && null;
    throw new Error('InsForge Postgres driver not implemented yet — set the driver in records.js');
  },
  // Storage → uploaded invoices, catalogs, price lists, allergen sheets.
  async putFile(key) {
    if (!this.configured()) return logSeam('insforge.storage', `would upload ${key}`) && { key, url: null, stored: false };
    throw new Error('InsForge Storage driver not implemented yet');
  },
  // Model Gateway → the single OpenAI-compatible LLM endpoint (co-pilot, invoice parsing,
  // embeddings for guest/item similarity).
  async chat(messages, opts = {}) {
    if (!this.configured()) {
      logSeam('insforge.gateway', `would call model ${opts.model || 'default'} with ${messages.length} messages`);
      return null; // caller falls back to the grounded responder
    }
    throw new Error('InsForge Model Gateway driver not implemented yet');
  },
};

// ── Runtype — agent & flow runtime (over MCP) ────────────────────────────────
// Each intelligent unit is a Runtype agent invoked over MCP, with tools that read/write
// InsForge and call the Model Gateway. Agents DRAFT; an operator or a rule sends.
export const RUNTYPE_AGENTS = [
  { key: 'copilot',           label: 'Co-pilot',            role: 'answers operator questions, per role' },
  { key: 'reorder-decisioner', label: 'Reorder decisioner', role: 'forecasts demand and drafts the PO' },
  { key: 'invoice-reconciler', label: 'Invoice reconciler', role: 'parses invoices, matches to the PO, flags variances' },
  { key: 'guest-predictor',    label: 'Guest predictor',    role: 'ranks a guest\'s likely order from their tickets' },
  { key: 'concierge',          label: 'Concierge persona',  role: 'fields follow-up questions at the table' },
];

export const runtype = {
  configured: () => Boolean(process.env.RUNTYPE_TOKEN),
  mode() { return this.configured() ? 'connected' : 'local'; },
  async invoke(agentKey, input) {
    if (!this.configured()) {
      logSeam('runtype.agent', `would invoke '${agentKey}' with ${JSON.stringify(input).slice(0, 120)}…`);
      return null; // caller uses the local heuristic / grounded fallback
    }
    throw new Error('Runtype MCP client not implemented yet — see docs/ARCHITECTURE.md');
  },
  // Schedules drive the par sweep + the pre-shift brief.
  async schedule(name, cron) {
    if (!this.configured()) return logSeam('runtype.schedule', `would register '${name}' on ${cron}`) && null;
    throw new Error('Runtype schedules not implemented yet');
  },
};

// ── Cotal — multi-agent coordination mesh (NATS/JetStream) ───────────────────
// Only meaningful once more than one agent is live. Three delivery shapes:
//   multicast — an event to a channel        (low-stock → #purchasing)
//   anycast   — work to any free agent of a role (reorder-agent pool)
//   unicast   — a supervised route            (drafted PO → approval → dispatch)
export const cotal = {
  configured: () => Boolean(process.env.COTAL_URL && process.env.COTAL_JWT),
  mode() { return this.configured() ? 'connected' : 'local'; },
  async multicast(channel, event, payload = {}) {
    if (!this.configured()) return logSeam('cotal.multicast', `would publish '${event}' to #${channel}`) && null;
    throw new Error('Cotal client not implemented yet');
  },
  async anycast(role, task, payload = {}) {
    if (!this.configured()) return logSeam('cotal.anycast', `would dispatch '${task}' to any free ${role}`) && null;
    throw new Error('Cotal client not implemented yet');
  },
  async unicast(agent, task, payload = {}) {
    if (!this.configured()) return logSeam('cotal.unicast', `would route '${task}' to ${agent}`) && null;
    throw new Error('Cotal client not implemented yet');
  },
};

// Subsystem modes for /api/health — the app labels demo vs live honestly.
// `llm` names the engine that would actually answer, in the same precedence order
// askCopilot() tries them, so the header chip never overstates what is connected.
export const subsystemModes = () => ({
  records:  insforge.configured() ? 'insforge' : 'local',
  auth:     insforge.configured() ? 'insforge' : 'local',
  storage:  insforge.configured() ? 'insforge' : 'local',
  llm:      runtype.configured() ? 'runtype'
          : insforge.configured() ? 'insforge-gateway'
          : process.env.ANTHROPIC_API_KEY ? `anthropic:${process.env.ANTHROPIC_MODEL || 'claude-opus-4-8'}`
          : 'grounded-fallback',
  agents:   runtype.mode(),
  mesh:     cotal.mode(),
});
