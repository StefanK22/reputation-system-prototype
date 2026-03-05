import { requestJson } from './httpClient.js';

function normalizeTemplateId(templateId) {
  const value = String(templateId || '');
  if (!value) {
    return value;
  }
  const parts = value.split(':');
  return parts[parts.length - 1] || value;
}

function toEvent(createdEvent, fallbackOffset = 0) {
  return {
    offset: Number(createdEvent.offset ?? fallbackOffset),
    contractId: createdEvent.contractId,
    templateId: normalizeTemplateId(createdEvent.templateId),
    payload: createdEvent.createArgument || createdEvent.payload || {},
    createdAt: createdEvent.createdAt || new Date().toISOString(),
  };
}

export class CantonApiLedgerClient {
  constructor({ baseUrl, party = 'OPERATOR', userId = 'operator-user' }) {
    this.baseUrl = baseUrl;
    this.party = party;
    this.userId = userId;
  }

  async publish(templateId, payload) {
    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const body = {
      commands: {
        commands: [
          {
            CreateCommand: {
              templateId,
              createArguments: payload,
            },
          },
        ],
        userId: this.userId,
        commandId,
        actAs: [this.party],
      },
    };

    const response = await requestJson(this.baseUrl, '/v2/commands/submit-and-wait-for-transaction', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    const transactionEvents = Array.isArray(response.transaction?.events) ? response.transaction.events : [];
    const firstCreated = transactionEvents
      .map((event) => event.CreatedEvent || event.created || event.createdEvent)
      .find(Boolean);

    if (!firstCreated) {
      throw new Error('Canton API did not return a created event.');
    }

    return toEvent(firstCreated, response.transaction?.offset);
  }

  async streamFrom(offsetExclusive = 0) {
    const from = Number(offsetExclusive) || 0;
    const response = await requestJson(this.baseUrl, `/v2/events?from=${encodeURIComponent(from)}`);
    const events = Array.isArray(response.events) ? response.events : [];
    return events.map((event) => ({
      ...event,
      offset: Number(event.offset),
    }));
  }

  async ledgerEnd() {
    const response = await requestJson(this.baseUrl, '/v2/state/ledger-end');
    return Number(response.offset || 0);
  }
}
