import { fetchJson } from './http.js';
import { PAYLOAD_MAPS, CHOICE_MAPS } from '../contracts.js';

const OPERATOR_PARTY_ID = 'Operator'

// Convert a plain object to a Daml DA.Map array [[key,value],...].
// Already-serialized arrays pass through unchanged.
function toLedgerMap(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== 'object') return [];
  return Object.entries(v);
}

// Recursively apply the PAYLOAD_MAPS / CHOICE_MAPS schema to a payload,
// converting Map-typed fields to the [[key,value],...] format Canton expects.
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
    const name     = normalizeTemplateId(templateId);
    const encoded  = applyMaps(payload, PAYLOAD_MAPS[name]);
    const res      = await this._submit([{ CreateCommand: { templateId, createArguments: encoded } }]);
    const events   = Array.isArray(res.transaction?.events) ? res.transaction.events : [];
    const created  = events.map((e) => e.CreatedEvent || e.created || e.createdEvent).find(Boolean);
    if (!created) throw new Error('Canton did not return a created event.');
    return toEvent(created, res.transaction?.offset);
  }

  // templateId must be a fully-qualified ID from TEMPLATE_IDS in contracts.js
  async exercise(contractId, templateId, choiceName, choiceArgument = {}) {
    const encoded = applyMaps(choiceArgument, CHOICE_MAPS[choiceName]);
    const res     = await this._submit([{ ExerciseCommand: { contractId, templateId, choice: choiceName, choiceArgument: encoded } }]);
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

  // wait=true  (engine): polls every pollIntervalMs — sleeps then fetches a
  //            snapshot of active contracts, honours abort signal.
  // wait=false (web app /events route): returns active contracts immediately.
  async streamFrom(_offsetExclusive = 0, { signal, wait = true, pollIntervalMs = 5_000 } = {}) {
    if (wait) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, pollIntervalMs);
        signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
      if (signal?.aborted) return [];
    }

    try {
      const offset = await this._ledgerOffset();
      const res    = await fetchJson(this.baseUrl, '/v2/state/active-contracts', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({
          filter: {
            filtersByParty: {
              [this.party]: {
                cumulative: [{
                  identifierFilter: {
                    WildcardFilter: { value: { includeCreatedEventBlob: true } },
                  },
                }],
              },
            },
          },
          verbose:        true,
          activeAtOffset: offset,
        }),
      });
      return parseContracts(res).map((c) => ({
        offset:     Number(c.offset ?? 0),
        contractId: c.contractId,
        templateId: c.templateId,
        payload:    c.payload,
        createdAt:  c.createdAt || new Date().toISOString(),
      }));
    } catch (e) {
      if (signal?.aborted || e.name === 'AbortError') return [];
      throw e;
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

  // Discover current fully-qualified template IDs by scanning all active contracts.
  // Returns { shortName: rawTemplateId, ... } — e.g. { ReputationToken: "pkg::Reputation:ReputationToken" }.
  // The engine calls this at startup so it never relies on stale codegen package hashes.
  async discoverTemplateIds() {
    const offset = await this._ledgerOffset();
    const res    = await fetchJson(this.baseUrl, '/v2/state/active-contracts', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({
        filter: {
          filtersByParty: {
            [this.party]: {
              cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: true } } } }],
            },
          },
        },
        verbose:        true,
        activeAtOffset: offset,
      }),
    });

    const ids   = {};
    const items = Array.isArray(res) ? res
                : Array.isArray(res?.result) ? res.result
                : [];
    for (const item of items) {
      const event = item.contractEntry?.JsActiveContract?.createdEvent || item.createdEvent;
      if (event?.templateId) {
        const short = normalizeTemplateId(event.templateId);
        ids[short]  = event.templateId;
      }
    }
    return ids;
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

