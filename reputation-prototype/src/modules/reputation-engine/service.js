import http from 'node:http';
import { URL } from 'node:url';
import { AsyncReputationEngine } from './asyncReputationEngine.js';
import { CantonApiLedgerClient } from '../../shared/clients/cantonApiLedgerClient.js';
import { PostgresReadModelStore } from '../../shared/store/postgresReadModelStore.js';
import { createPort, parsePositiveNumber } from '../../shared/runtime/lifecycle.js';
import { sendJson } from '../../shared/runtime/http.js';

export function createReputationEngineConfig(env = process.env) {
  return {
    port: createPort(env.PORT, 9091),
    pollIntervalMs: parsePositiveNumber(env.POLL_INTERVAL_MS, 3000),
    cantonApiUrl: env.CANTON_API_URL || 'http://canton-node:7575',
    databaseUrl:
      env.DATABASE_URL || 'postgresql://reputation:reputation_password@database:5432/reputation',
    cantonParty: env.CANTON_PARTY || 'OPERATOR',
    cantonUserId: env.CANTON_USER_ID || 'operator-user',
  };
}

export class ReputationEngineService {
  constructor(config) {
    this.config = config;
    this.server = null;
    this.pollTimer = null;
    this.store = new PostgresReadModelStore({ connectionString: config.databaseUrl });
    this.ledger = new CantonApiLedgerClient({
      baseUrl: config.cantonApiUrl,
      party: config.cantonParty,
      userId: config.cantonUserId,
    });
    this.engine = new AsyncReputationEngine({
      ledger: this.ledger,
      store: this.store,
    });
  }

  async start() {
    await this.store.ensureReady();
    await this.engine.init();

    const initialStats = await this.engine.processNewEvents();
    console.log('Initial processing stats:', initialStats);

    this.pollTimer = setInterval(() => {
      this.processAndReport();
    }, this.config.pollIntervalMs);

    this.server = this.createHttpServer();
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.config.port, resolve);
    });

    console.log(`Reputation engine listening on http://localhost:${this.config.port}`);
  }

  async processAndReport() {
    try {
      const stats = await this.engine.processNewEvents();
      if (stats.consumedEvents > 0) {
        console.log('Processed new ledger events:', stats);
      }
      return stats;
    } catch (error) {
      console.error('Engine polling failed:', error.message);
      return { error: error.message };
    }
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
            checkpoint: this.engine.getCheckpoint(),
          });
          return;
        }

        if (req.method === 'GET' && pathname === '/checkpoint') {
          sendJson(res, 200, {
            checkpoint: this.engine.getCheckpoint(),
          });
          return;
        }

        if (req.method === 'POST' && pathname === '/process') {
          const stats = await this.engine.processNewEvents();
          sendJson(res, 200, stats);
          return;
        }

        sendJson(res, 404, { error: 'Route not found' });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
    });
  }

  async stop(signal = 'SIGTERM') {
    console.log(`Received ${signal}, shutting down reputation engine...`);
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    if (this.server) {
      await new Promise((resolve) => this.server.close(resolve));
    }
    await this.store.close();
  }
}
