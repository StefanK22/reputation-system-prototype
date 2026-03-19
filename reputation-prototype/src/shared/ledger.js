import { fetchJson } from './http.js';

function normalizeTemplateId(id) {
  const s = String(id || '');
  const parts = s.split(':');
  return parts[parts.length - 1] || s;
}

function toEvent(created, fallbackOffset = 0) {
  return {
    offset:     Number(created.offset ?? fallbackOffset),
    contractId: created.contractId,
    templateId: normalizeTemplateId(created.templateId),
    payload:    created.createArgument || created.payload || {},
    createdAt:  created.createdAt || new Date().toISOString(),
  };
}

export class LedgerClient {
  constructor({ baseUrl, party = 'OPERATOR', userId = 'operator-user' }) {
    this.baseUrl = baseUrl;
    this.party   = party;
    this.userId  = userId;
  }

  async _submit(commands) {
    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return fetchJson(this.baseUrl, '/v2/commands/submit-and-wait-for-transaction', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ commands: { commands, userId: this.userId, commandId, actAs: [this.party] } }),
    });
  }

  async create(templateId, payload) {
    const res     = await this._submit([{ CreateCommand: { templateId, createArguments: payload } }]);
    const events  = Array.isArray(res.transaction?.events) ? res.transaction.events : [];
    const created = events.map((e) => e.CreatedEvent || e.created || e.createdEvent).find(Boolean);
    if (!created) throw new Error('Canton did not return a created event.');
    return toEvent(created, res.transaction?.offset);
  }

  async exercise(contractId, templateId, choiceName, choiceArgument = {}) {
    const res     = await this._submit([{ ExerciseCommand: { contractId, templateId, choiceName, choiceArgument } }]);
    const events  = Array.isArray(res.transaction?.events) ? res.transaction.events : [];
    const created = events.map((e) => e.CreatedEvent || e.created || e.createdEvent).find(Boolean);
    if (!created) throw new Error(`Exercise ${choiceName} did not return a created event.`);
    return toEvent(created, res.transaction?.offset);
  }

  // Fetches events after offsetExclusive from the Canton node.
  //
  // wait=true (default, used by the engine): long-polls — the server holds the
  // connection open until a new event arrives or its 30s timeout elapses, then
  // the engine loops immediately. This means the engine reacts to events as
  // they land on the ledger with no arbitrary polling interval.
  //
  // wait=false (used by the web app's /events route): returns immediately with
  // whatever events are currently available, like a normal HTTP GET.
  //
  // Accepts an AbortSignal so the engine can cancel in-flight requests on shutdown.
  async streamFrom(offsetExclusive = 0, { signal, wait = true } = {}) {
    const from = Number(offsetExclusive) || 0;

    if (!wait) {
      const res = await fetchJson(this.baseUrl, `/v2/events?from=${from}`);
      return (Array.isArray(res.events) ? res.events : []).map((e) => ({ ...e, offset: Number(e.offset) }));
    }

    // Long-poll path: local controller combines the caller's signal with a
    // client-side timeout set slightly longer than the server's own (30s),
    // so the server always responds first under normal conditions.
    const local   = new AbortController();
    const timer   = setTimeout(() => local.abort(), 35_000);
    const forward = () => local.abort();
    signal?.addEventListener('abort', forward, { once: true });

    try {
      const res = await fetchJson(
        this.baseUrl,
        `/v2/events?from=${from}&wait=true&timeout=30000`,
        { signal: local.signal },
      );
      return (Array.isArray(res.events) ? res.events : []).map((e) => ({ ...e, offset: Number(e.offset) }));
    } catch (e) {
      if (e.name === 'AbortError') return []; // timeout or shutdown — caller reconnects
      throw e;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forward);
    }
  }

  async ledgerEnd() {
    const res = await fetchJson(this.baseUrl, '/v2/state/ledger-end');
    return Number(res.offset || 0);
  }
}