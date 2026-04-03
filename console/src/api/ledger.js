import { PAYLOAD_MAPS, CHOICE_MAPS } from './contracts.js';

const OPERATOR_PARTY_ID = 'Operator';

function toLedgerMap(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== 'object') return [];
  return Object.entries(v);
}

function applyMaps(obj, schema) {
  if (!schema || !obj || typeof obj !== 'object') return obj;
  const result = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const [key, rule] of Object.entries(schema)) {
    if (!(key in result)) continue;
    if (rule === '*') {
      result[key] = toLedgerMap(result[key]);
    } else {
      const v = result[key];
      result[key] = Array.isArray(v) ? v.map((item) => applyMaps(item, rule)) : applyMaps(v, rule);
    }
  }
  return result;
}

function normalizeTemplateId(id) {
  const s     = String(id || '');
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

function parseContracts(response) {
  const unwrap = (item) => {
    const event = item.contractEntry?.JsActiveContract?.createdEvent || item.createdEvent;
    if (event) {
      return {
        contractId:    event.contractId,
        payload:       event.createArgument || event.payload,
        templateId:    normalizeTemplateId(event.templateId),
        rawTemplateId: event.templateId,
        signatories:   event.signatories   || [],
        observers:     event.observers     || [],
        agreementText: event.agreementText || '',
      };
    }
    return item;
  };

  if (Array.isArray(response))                  return response.map(unwrap);
  if (Array.isArray(response?.result))          return response.result.map(unwrap);
  if (Array.isArray(response?.contracts))       return response.contracts;
  if (Array.isArray(response?.activeContracts)) return response.activeContracts;
  return [];
}

async function fetchJson(baseUrl, pathname, options = {}) {
  const url  = String(baseUrl).replace(/\/$/, '') + pathname;
  const res  = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

export class LedgerClient {
  constructor({ baseUrl, party = 'OPERATOR', userId = 'operator-user' }) {
    this.baseUrl = baseUrl;
    this.party   = party;
    this.userId  = userId;
  }

  static async getOperatorPartyId(baseUrl) {
    const res     = await fetchJson(baseUrl, '/v2/parties');
    const parties = res.partyDetails || [];
    const operator = parties.find((p) => p.party.startsWith(OPERATOR_PARTY_ID));
    if (!operator) throw new Error('No operator party was found.');
    return operator.party;
  }

  async _submit(commands, extraActAs = []) {
    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const actAs     = extraActAs.length ? [this.party, ...extraActAs] : [this.party];
    return fetchJson(this.baseUrl, '/v2/commands/submit-and-wait-for-transaction', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({
        commands: { commands, userId: this.userId, commandId, actAs },
      }),
    });
  }

  async _ledgerOffset() {
    try {
      const res = await fetchJson(this.baseUrl, '/v2/state/ledger-end');
      return String(res.offset || '0');
    } catch {
      return '0';
    }
  }

  // ── Party / user management ─────────────────────────────────────────────────

  async createUser(userId, primaryParty) {
    return fetchJson(this.baseUrl, '/v2/users', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        user: {
          id: userId,
          primaryParty: primaryParty,
          actAs: [primaryParty],
          readAs: [],
          isDeactivated: false,
          metadata: {
            resourceVersion: '',
            annotations: {},
          },
          identityProviderId: '',
        },
      }),
    });
  }

  // ── Contract operations ─────────────────────────────────────────────────────

  async create(templateId, payload, { actAs = [] } = {}) {
    const name    = normalizeTemplateId(templateId);
    const encoded = applyMaps(payload, PAYLOAD_MAPS[name]);
    const res     = await this._submit([{ CreateCommand: { templateId, createArguments: encoded } }], actAs);
    const events  = Array.isArray(res.transaction?.events) ? res.transaction.events : [];
    const created = events.map((e) => e.CreatedEvent || e.created || e.createdEvent).find(Boolean);
    if (!created) throw new Error('Canton did not return a created event.');
    return toEvent(created, res.transaction?.offset);
  }

  async exercise(contractId, templateId, choiceName, choiceArgument = {}) {
    const encoded = applyMaps(choiceArgument, CHOICE_MAPS[choiceName]);
    const res     = await this._submit([{ ExerciseCommand: { contractId, templateId, choice: choiceName, choiceArgument: encoded } }]);
    const events  = Array.isArray(res.transaction?.events) ? res.transaction.events : [];
    const created = events.map((e) => e.CreatedEvent || e.created || e.createdEvent).find(Boolean);
    if (!created) throw new Error(`Exercise ${choiceName} did not return a created event.`);
    return toEvent(created, res.transaction?.offset);
  }

  async query(templateId, activeAtOffset) {
    const offset = activeAtOffset || await this._ledgerOffset();
    const res    = await fetchJson(this.baseUrl, '/v2/state/active-contracts', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({
        filter: {
          filtersByParty: {
            [this.party]: {
              cumulative: [{
                identifierFilter: {
                  TemplateFilter: {
                    value: { templateId, includeCreatedEventBlob: true },
                  },
                },
              }],
            },
          },
        },
        verbose:        true,
        activeAtOffset: offset,
      }),
    });
    return parseContracts(res);
  }

  // ── Event stream ────────────────────────────────────────────────────────────

  async streamFrom(offsetExclusive = 0, { signal, wait = true } = {}) {
    const from = Number(offsetExclusive) || 0;

    if (!wait) {
      const res = await fetchJson(this.baseUrl, `/v2/events?from=${from}`);
      return (Array.isArray(res.events) ? res.events : []).map((e) => ({ ...e, offset: Number(e.offset) }));
    }

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
      if (e.name === 'AbortError') return [];
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

  // ── Dev / admin inspection ──────────────────────────────────────────────────

  async listAllParties() {
    const res     = await fetchJson(this.baseUrl, '/v2/parties');
    const parties = (res.partyDetails || []).map((p) => ({
      party:       p.party,
      displayName: p.party.split('::')[0] || p.party,
      isLocal:     p.isLocal,
    }));
    return { parties };
  }

  async listAllUsers() {
    return fetchJson(this.baseUrl, '/v2/users');
  }

  async queryAsParty(party, templateId, activeAtOffset) {
    const offset = activeAtOffset || await this._ledgerOffset();
    const res    = await fetchJson(this.baseUrl, '/v2/state/active-contracts', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({
        filter: {
          filtersByParty: {
            [party]: {
              cumulative: [{
                identifierFilter: {
                  TemplateFilter: {
                    value: { templateId, includeCreatedEventBlob: true },
                  },
                },
              }],
            },
          },
        },
        verbose:        true,
        activeAtOffset: offset,
      }),
    });
    return parseContracts(res);
  }

  async queryAllParties(templateId) {
    const { parties }  = await this.listAllParties();
    const byParty      = {};
    const allContracts = [];

    for (const partyInfo of parties) {
      try {
        const contracts = await this.queryAsParty(partyInfo.party, templateId);
        byParty[partyInfo.party] = contracts;
        contracts.forEach((c) => allContracts.push({ ...c, ownerParty: partyInfo.party }));
      } catch (err) {
        console.warn(`[LedgerClient] Failed to query party ${partyInfo.party}:`, err.message);
        byParty[partyInfo.party] = [];
      }
    }

    return { byParty, allContracts };
  }

  async getFullLedgerState() {
    const [{ parties }, packagesRes] = await Promise.all([
      this.listAllParties(),
      fetchJson(this.baseUrl, '/v2/packages'),
    ]);
    return {
      parties,
      contractsByTemplate: {},
    };
  }

  // ── Browser-only ────────────────────────────────────────────────────────────

  // Query all active contracts for a party without filtering by template.
  // Used by the console to discover rawTemplateIds and show all ledger state.
  async queryAll(party) {
    const offset = await this._ledgerOffset();
    const res    = await fetchJson(this.baseUrl, '/v2/state/active-contracts', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({
        filter: {
          filtersByParty: {
            [party || this.party]: {
              cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: true } } } }],
            },
          },
        },
        verbose:        true,
        activeAtOffset: offset,
      }),
    });
    return parseContracts(res);
  }
}
