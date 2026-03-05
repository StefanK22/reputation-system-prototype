import http from 'node:http';
import { URL } from 'node:url';
import { seedContracts } from './seedContracts.js';
import { createPort } from '../../shared/runtime/lifecycle.js';
import { readJsonBody, sendJson } from '../../shared/runtime/http.js';

function toTemplateAlias(templateIdRaw) {
  const raw = String(templateIdRaw || '');
  if (!raw) {
    return raw;
  }

  const colonParts = raw.split(':');
  const tail = colonParts[colonParts.length - 1] || raw;

  if (tail.includes('.')) {
    const dotParts = tail.split('.');
    return dotParts[dotParts.length - 1] || tail;
  }

  return tail;
}

function toCreatedEvent(event) {
  return {
    offset: String(event.offset),
    contractId: event.contractId,
    templateId: event.templateId,
    createArgument: event.payload,
    createdAt: event.createdAt,
    signatories: [],
    observers: [],
    agreementText: '',
  };
}

function extractTemplateFilters(body) {
  const templates = [];
  const byParty = body?.filter?.filtersByParty;
  if (!byParty || typeof byParty !== 'object') {
    return templates;
  }

  for (const partyFilter of Object.values(byParty)) {
    const cumulative = Array.isArray(partyFilter?.cumulative) ? partyFilter.cumulative : [];
    for (const item of cumulative) {
      const templateId = item?.identifierFilter?.TemplateFilter?.value?.templateId;
      if (templateId) {
        templates.push(toTemplateAlias(templateId));
      }
    }
  }

  return templates;
}

export function createCantonNodeConfig(env = process.env) {
  return {
    port: createPort(env.PORT, 7575),
    seedContracts: env.SEED_CONTRACTS !== '0',
  };
}

export class MockCantonNodeService {
  constructor(config) {
    this.config = config;
    this.server = null;
    this.state = {
      events: [],
      nextOffset: 1,
    };
  }

  publish(templateId, payload) {
    const offset = this.state.nextOffset;
    this.state.nextOffset += 1;

    const event = {
      offset,
      contractId: `${toTemplateAlias(templateId)}#${offset}`,
      templateId: toTemplateAlias(templateId),
      payload,
      createdAt: new Date().toISOString(),
    };

    this.state.events.push(event);
    return event;
  }

  seed() {
    if (!this.config.seedContracts) {
      return;
    }

    seedContracts({
      publish: (templateId, payload) => this.publish(templateId, payload),
    });
  }

  createHttpServer() {
    return http.createServer(async (req, res) => {
      try {
        if (!req.url || !req.method) {
          sendJson(res, 400, { error: 'Invalid request' });
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const pathname = url.pathname;

        if (req.method === 'GET' && pathname === '/health') {
          sendJson(res, 200, {
            status: 'ok',
            ledgerEnd: this.state.nextOffset - 1,
            eventCount: this.state.events.length,
          });
          return;
        }

        if (req.method === 'GET' && pathname === '/v2/state/ledger-end') {
          sendJson(res, 200, { offset: String(this.state.nextOffset - 1) });
          return;
        }

        if (req.method === 'GET' && pathname === '/v2/events') {
          const from = Number(url.searchParams.get('from') || 0);
          const events = this.state.events.filter((event) => event.offset > from);
          sendJson(res, 200, { events });
          return;
        }

        if (req.method === 'POST' && pathname === '/v2/parties') {
          const body = await readJsonBody(req);
          const identifierHint = String(body.identifierHint || body.displayName || 'party')
            .replace(/\s+/g, '_')
            .toUpperCase();
          const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
          sendJson(res, 201, { party: `${identifierHint}::${suffix}` });
          return;
        }

        if (req.method === 'POST' && pathname === '/v2/users') {
          const body = await readJsonBody(req);
          sendJson(res, 201, { id: String(body.id || 'user') });
          return;
        }

        if (req.method === 'POST' && pathname === '/v2/state/active-contracts') {
          const body = await readJsonBody(req);
          const templateFilters = extractTemplateFilters(body);
          const activeAtOffset = Number(body.activeAtOffset || this.state.nextOffset - 1);

          const contracts = this.state.events
            .filter((event) => event.offset <= activeAtOffset)
            .filter((event) => templateFilters.length === 0 || templateFilters.includes(event.templateId))
            .map((event) => ({
              contractEntry: {
                JsActiveContract: {
                  createdEvent: toCreatedEvent(event),
                },
              },
            }));

          sendJson(res, 200, contracts);
          return;
        }

        if (req.method === 'POST' && pathname === '/v2/commands/submit-and-wait-for-transaction') {
          const body = await readJsonBody(req);
          const commands = Array.isArray(body?.commands?.commands) ? body.commands.commands : [];

          const createdEvents = [];
          for (const item of commands) {
            const createCommand = item?.CreateCommand;
            if (!createCommand) {
              continue;
            }

            const templateId = createCommand.templateId;
            const payload = createCommand.createArguments || {};
            const event = this.publish(templateId, payload);
            createdEvents.push({
              CreatedEvent: toCreatedEvent(event),
            });
          }

          if (createdEvents.length === 0) {
            sendJson(res, 400, { error: 'No CreateCommand found in commands payload.' });
            return;
          }

          sendJson(res, 200, {
            transaction: {
              offset: String(this.state.nextOffset - 1),
              events: createdEvents,
            },
          });
          return;
        }

        sendJson(res, 404, { error: 'Route not found' });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
    });
  }

  async start() {
    this.seed();
    this.server = this.createHttpServer();
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.config.port, resolve);
    });

    console.log(`Mock Canton node listening on http://localhost:${this.config.port}`);
    console.log(`Seeded events: ${this.state.events.length}`);
  }

  async stop(signal = 'SIGTERM') {
    console.log(`Received ${signal}, shutting down mock canton node...`);
    if (this.server) {
      await new Promise((resolve) => this.server.close(resolve));
    }
  }
}
