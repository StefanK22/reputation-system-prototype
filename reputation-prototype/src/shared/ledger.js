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

  // Submit a CreateCommand. Returns the created event.
  async create(templateId, payload) {
    const res     = await this._submit([{ CreateCommand: { templateId, createArguments: payload } }]);
    const events  = Array.isArray(res.transaction?.events) ? res.transaction.events : [];
    const created = events.map((e) => e.CreatedEvent || e.created || e.createdEvent).find(Boolean);
    if (!created) throw new Error('Canton did not return a created event.');
    return toEvent(created, res.transaction?.offset);
  }

  // Submit an ExerciseCommand on an existing contract.
  // Archives the current contract; returns the new created event from the choice result.
  async exercise(contractId, templateId, choiceName, choiceArgument = {}) {
    const res     = await this._submit([{ ExerciseCommand: { contractId, templateId, choiceName, choiceArgument } }]);
    const events  = Array.isArray(res.transaction?.events) ? res.transaction.events : [];
    const created = events.map((e) => e.CreatedEvent || e.created || e.createdEvent).find(Boolean);
    if (!created) throw new Error(`Exercise ${choiceName} did not return a created event.`);
    return toEvent(created, res.transaction?.offset);
  }

  async streamFrom(offsetExclusive = 0) {
    const res = await fetchJson(this.baseUrl, `/v2/events?from=${Number(offsetExclusive) || 0}`);
    return (Array.isArray(res.events) ? res.events : []).map((e) => ({ ...e, offset: Number(e.offset) }));
  }

  async ledgerEnd() {
    const res = await fetchJson(this.baseUrl, '/v2/state/ledger-end');
    return Number(res.offset || 0);
  }
}
