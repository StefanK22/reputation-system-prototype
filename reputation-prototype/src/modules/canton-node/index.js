import http from 'node:http';
import { URL } from 'node:url';
import { sendJson, readBody } from '../../shared/http.js';
import { createPort, runService } from '../../shared/lifecycle.js';
import { seed } from './seed.js';

const LONG_POLL_MAX_MS = 30_000;

function toAlias(templateId) {
  const s    = String(templateId || '');
  const tail = s.split(':').pop() || s;
  return tail.includes('.') ? tail.split('.').pop() || tail : tail;
}

function toCreatedEvent(e) {
  return {
    offset: String(e.offset), contractId: e.contractId, templateId: e.templateId,
    createArgument: e.payload, createdAt: e.createdAt, signatories: [], observers: [],
  };
}

class CantonNodeService {
  constructor({ port, seedData }) {
    this.port     = port;
    this.seedData = seedData;
    this.events   = [];
    this.archived = new Set();
    this.next     = 1;
    this.server   = null;

    // Pending long-poll requests: { from, res, timer }
    // Each entry represents an engine connection waiting for new events.
    this.pending  = [];
  }

  _create(templateId, payload) {
    const offset = this.next++;
    const event  = {
      offset, contractId: `${toAlias(templateId)}#${offset}`,
      templateId: toAlias(templateId), payload, createdAt: new Date().toISOString(),
    };
    this.events.push(event);
    this._flushPending(); // notify any waiting long-poll connections
    return event;
  }

  _exercise(contractId, choiceName, choiceArgument) {
    const existing = this.events.find((e) => e.contractId === contractId);
    if (!existing || this.archived.has(contractId))
      throw new Error(`Contract ${contractId} not found or already archived`);
    this.archived.add(contractId);
    return this._create(existing.templateId, choiceArgument);
  }

  // Resolve any pending long-poll connections that now have events available.
  _flushPending() {
    const still = [];
    for (const p of this.pending) {
      const events = this.events
        .filter((e) => e.offset > p.from)
        .map((e) => ({ ...e, archived: this.archived.has(e.contractId) }));

      if (events.length > 0) {
        clearTimeout(p.timer);
        sendJson(p.res, 200, { events });
      } else {
        still.push(p);
      }
    }
    this.pending = still;
  }

  // Register a long-poll request. Resolves immediately if events already exist,
  // otherwise holds the connection until _flushPending() is called or the
  // server-side timeout fires.
  _waitForEvents(from, res, timeoutMs) {
    const events = this.events
      .filter((e) => e.offset > from)
      .map((e) => ({ ...e, archived: this.archived.has(e.contractId) }));

    if (events.length > 0) {
      sendJson(res, 200, { events });
      return;
    }

    const timer = setTimeout(() => {
      this.pending = this.pending.filter((p) => p.res !== res);
      sendJson(res, 200, { events: [] }); // timeout — client reconnects
    }, Math.min(timeoutMs, LONG_POLL_MAX_MS));

    this.pending.push({ from, res, timer });
  }

  async start() {
    if (this.seedData) seed({ publish: (t, p) => this._create(t, p) });

    this.server = http.createServer(async (req, res) => {
      try {
        const url      = new URL(req.url, 'http://localhost');
        const { pathname } = url;
        const method   = req.method;

        if (method === 'GET'  && pathname === '/health')
          return sendJson(res, 200, { status: 'ok', eventCount: this.events.length });

        if (method === 'GET'  && pathname === '/v2/state/ledger-end')
          return sendJson(res, 200, { offset: String(this.next - 1) });

        if (method === 'GET'  && pathname === '/v2/events') {
          const from    = Number(url.searchParams.get('from')    || 0);
          const wait    = url.searchParams.get('wait') === 'true';
          const timeout = Number(url.searchParams.get('timeout') || LONG_POLL_MAX_MS);

          if (wait) return this._waitForEvents(from, res, timeout);

          return sendJson(res, 200, {
            events: this.events
              .filter((e) => e.offset > from)
              .map((e) => ({ ...e, archived: this.archived.has(e.contractId) })),
          });
        }

        if (method === 'POST' && pathname === '/v2/parties') {
          const body = await readBody(req);
          const hint = String(body.identifierHint || body.displayName || 'party').replace(/\s+/g, '_').toUpperCase();
          return sendJson(res, 201, { party: `${hint}::${Math.random().toString(36).slice(2, 10).toUpperCase()}` });
        }

        if (method === 'POST' && pathname === '/v2/users') {
          const body = await readBody(req);
          return sendJson(res, 201, { id: String(body.id || 'user') });
        }

        if (method === 'POST' && pathname === '/v2/state/active-contracts') {
          const body    = await readBody(req);
          const filters = [];
          for (const pf of Object.values(body?.filter?.filtersByParty ?? {}))
            for (const item of (pf?.cumulative ?? []))
              { const tid = item?.identifierFilter?.TemplateFilter?.value?.templateId; if (tid) filters.push(toAlias(tid)); }

          const atOffset = Number(body.activeAtOffset || this.next - 1);
          return sendJson(res, 200,
            this.events
              .filter((e) => e.offset <= atOffset && !this.archived.has(e.contractId) && (!filters.length || filters.includes(e.templateId)))
              .map((e) => ({ contractEntry: { JsActiveContract: { createdEvent: toCreatedEvent(e) } } }))
          );
        }

        if (method === 'POST' && pathname === '/v2/commands/submit-and-wait-for-transaction') {
          const body     = await readBody(req);
          const commands = body?.commands?.commands ?? [];
          const created  = [];
          for (const cmd of commands) {
            if (cmd?.CreateCommand) {
              const event = this._create(cmd.CreateCommand.templateId, cmd.CreateCommand.createArguments || {});
              created.push({ CreatedEvent: toCreatedEvent(event) });
            } else if (cmd?.ExerciseCommand) {
              const { contractId, choiceName, choiceArgument } = cmd.ExerciseCommand;
              const event = this._exercise(contractId, choiceName, choiceArgument || {});
              created.push({ CreatedEvent: toCreatedEvent(event) });
            }
          }
          if (!created.length) return sendJson(res, 400, { error: 'No CreateCommand or ExerciseCommand found' });
          return sendJson(res, 200, { transaction: { offset: String(this.next - 1), events: created } });
        }

        sendJson(res, 404, { error: 'Not found' });
      } catch (e) {
        sendJson(res, 500, { error: e.message });
      }
    });

    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(this.port, resolve); });
    console.log(`Canton node on :${this.port} (${this.events.length} seeded events)`);
  }

  async stop(signal = 'SIGTERM') {
    console.log(`Stopping canton node (${signal})`);
    // Drain pending long-poll connections before closing
    for (const p of this.pending) { clearTimeout(p.timer); sendJson(p.res, 200, { events: [] }); }
    this.pending = [];
    if (this.server) await new Promise((r) => this.server.close(r));
  }
}

runService({
  createConfig:  (env) => ({ port: createPort(env.PORT, 7575), seedData: env.SEED_CONTRACTS !== '0' }),
  createService: (config) => new CantonNodeService(config),
});