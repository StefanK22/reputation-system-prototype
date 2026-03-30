import { fetchJson } from './http.js';

const OPERATOR_PARTY_ID = 'Operator'

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


export class LedgerClient {
  constructor({ baseUrl, party = 'OPERATOR', userId = 'operator-user'}) {
    this.baseUrl = baseUrl;
    this.party   = party;
    this.userId  = userId;
  }
  
  static async getOperatorPartyId(baseUrl) {
    const res = await fetchJson(baseUrl, '/v2/parties');
    const parties = res.partyDetails || [];
    const operator = parties.find((p) => p.party.startsWith(OPERATOR_PARTY_ID))
    if (!operator) throw new Error('No operator party was found.');
    return operator.party;
  }
  
  async _submit(commands) {
    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return fetchJson(this.baseUrl, '/v2/commands/submit-and-wait-for-transaction', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({
        commands: { commands, userId: this.userId, commandId, actAs: [this.party] },
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
      headers: { 'content-type': 'application/json'},
      body: JSON.stringify({
        user: {
          id: userId,
          primaryParty: primaryParty,
          actAs: [primaryParty],
          readAs: [],
          isDeactivated: false,
          metadata: {
            resourceVersion: "",
            annotations: {}
          },
          identityProviderId: ""
        }
      })
    });
  }

  // ── Contract operations ─────────────────────────────────────────────────────

  // templateId must be a fully-qualified ID from TEMPLATE_IDS in contracts.js
  async create(templateId, payload) {
    const res     = await this._submit([{ CreateCommand: { templateId, createArguments: payload } }]);
    const events  = Array.isArray(res.transaction?.events) ? res.transaction.events : [];
    const created = events.map((e) => e.CreatedEvent || e.created || e.createdEvent).find(Boolean);
    if (!created) throw new Error('Canton did not return a created event.');
    return toEvent(created, res.transaction?.offset);
  }

  // templateId must be a fully-qualified ID from TEMPLATE_IDS in contracts.js
  async exercise(contractId, templateId, choiceName, choiceArgument = {}) {
    const res     = await this._submit([{ ExerciseCommand: { contractId, templateId, choice: choiceName, choiceArgument } }]);
    const events  = Array.isArray(res.transaction?.events) ? res.transaction.events : [];
    const created = events.map((e) => e.CreatedEvent || e.created || e.createdEvent).find(Boolean);
    if (!created) throw new Error(`Exercise ${choiceName} did not return a created event.`);
    return toEvent(created, res.transaction?.offset);
  }

  // Active-contracts snapshot — not used by the engine (which replays from offset 0)
  // but useful for the web app and admin tools.
  // templateId must be a fully-qualified ID from TEMPLATE_IDS in contracts.js
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

  // ── Event stream (engine) ───────────────────────────────────────────────────

  // wait=true  (engine): long-polls — server holds the connection open until a
  //            new event arrives or its 30s timeout elapses, then engine loops.
  // wait=false (web app /events route): returns immediately with current events.
  async streamFrom(offsetExclusive = 0, { signal, wait = true } = {}) {
    const from = Number(offsetExclusive) || 0;

    if (!wait) {
      const res = await fetchJson(this.baseUrl, `/v2/events?from=${from}`)
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
      packages:            packagesRes.packageIds || [],
      contractsByTemplate: {},
    };
  }
}

const baseUrl = 'http://localhost:7575';
const operatorId = await LedgerClient.getOperatorPartyId(baseUrl);
let ledger = new LedgerClient({ baseUrl: baseUrl, party: operatorId, userId: 'operator-user' });
import { TEMPLATES, TEMPLATE_IDS, CHOICES } from '../contracts.js';
let end = await ledger.ledgerEnd();
console.log(await ledger.query(TEMPLATE_IDS.ReputationConfiguration, end));
