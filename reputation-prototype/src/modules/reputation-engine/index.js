import http from 'node:http';
import { URL } from 'node:url';
import { ReputationEngine } from './core.js';
import { LedgerClient } from '../../shared/ledger.js';
import { DB } from '../../shared/db.js';
import { sendJson } from '../../shared/http.js';
import { createPort, parseNum, runService } from '../../shared/lifecycle.js';

class EngineService {
  constructor({ port, pollIntervalMs, cantonApiUrl, databaseUrl, cantonParty, cantonUserId }) {
    this.port   = port;
    this.pollMs = pollIntervalMs;
    this.db     = new DB({ connectionString: databaseUrl });
    this.ledger = new LedgerClient({ baseUrl: cantonApiUrl, party: cantonParty, userId: cantonUserId });
    this.engine = new ReputationEngine({ ledger: this.ledger, db: this.db });
    this.timer  = null;
    this.server = null;
  }

  async start() {
    await this.db.ensureReady();
    await this.engine.init();

    const initial = await this.engine.processNewEvents();
    console.log('Initial processing:', initial);

    this.timer = setInterval(async () => {
      try {
        const stats = await this.engine.processNewEvents();
        if (stats.consumed > 0) console.log('Processed events:', stats);
      } catch (e) { console.error('Poll failed:', e.message); }
    }, this.pollMs);

    this.server = http.createServer(async (req, res) => {
      try {
        const { pathname } = new URL(req.url, 'http://localhost');

        if (req.method === 'GET'  && pathname === '/health')
          return sendJson(res, 200, { status: 'ok', checkpoint: this.engine.getCheckpoint() });

        if (req.method === 'GET'  && pathname === '/checkpoint')
          return sendJson(res, 200, { checkpoint: this.engine.getCheckpoint() });

        if (req.method === 'POST' && pathname === '/process') {
          const stats = await this.engine.processNewEvents();
          return sendJson(res, 200, stats);
        }

        sendJson(res, 404, { error: 'Not found' });
      } catch (e) { sendJson(res, 500, { error: e.message }); }
    });

    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(this.port, resolve); });
    console.log(`Reputation engine on :${this.port}`);
  }

  async stop(signal = 'SIGTERM') {
    console.log(`Stopping engine (${signal})`);
    if (this.timer)  clearInterval(this.timer);
    if (this.server) await new Promise((r) => this.server.close(r));
    await this.db.close();
  }
}

runService({
  createConfig: (env) => ({
    port:          createPort(env.PORT, 9091),
    pollIntervalMs: parseNum(env.POLL_INTERVAL_MS, 3000),
    cantonApiUrl:  env.CANTON_API_URL  || 'http://canton-node:7575',
    databaseUrl:   env.DATABASE_URL    || 'postgresql://reputation:reputation_password@database:5432/reputation',
    cantonParty:   env.CANTON_PARTY    || 'OPERATOR',
    cantonUserId:  env.CANTON_USER_ID  || 'operator-user',
  }),
  createService: (config) => new EngineService(config),
});