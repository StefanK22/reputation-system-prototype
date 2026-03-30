import http from 'node:http';
import { URL } from 'node:url';
import { handleConsole } from './console.js';
import { LedgerClient }  from '../../shared/ledger.js';
import { DB }            from '../../shared/db.js';
import { sendJson }      from '../../shared/http.js';
import { createPort, runService } from '../../shared/lifecycle.js';

class ConsoleService {
  constructor({ port, cantonApiUrl, databaseUrl, cantonPartyName, cantonUserId, apiUrl }) {
    this.port           = port;
    this.cantonApiUrl   = cantonApiUrl;
    this.databaseUrl    = databaseUrl;
    this.cantonPartyName = cantonPartyName;
    this.cantonUserId   = cantonUserId;
    this.apiUrl         = apiUrl;
    this.db             = null;
    this.ledger         = null;
    this.server         = null;
  }

  async start() {
    const partyId = await LedgerClient.getOperatorPartyId(this.cantonApiUrl);
    this.db     = new DB({ connectionString: this.databaseUrl });
    this.ledger = new LedgerClient({ baseUrl: this.cantonApiUrl, party: partyId, userId: this.cantonUserId });

    this.server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        const ctx = { url, db: this.db, ledger: this.ledger, apiUrl: this.apiUrl };
        if (await handleConsole(req, res, ctx) !== false) return;
        sendJson(res, 404, { error: 'Not found' });
      } catch (e) {
        sendJson(res, 500, { error: e.message });
      }
    });

    await this.db.ensureReady();
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(this.port, resolve); });
    console.log(`Console on :${this.port}  →  http://localhost:${this.port}`);
  }

  async stop(signal = 'SIGTERM') {
    console.log(`Stopping console (${signal})`);
    await new Promise((r) => this.server.close(r));
    await this.db.close();
  }
}

runService({
  createConfig: (env) => ({
    port:            createPort(env.PORT, 3000),
    cantonApiUrl:    env.CANTON_API_URL,
    databaseUrl:     env.DATABASE_URL,
    cantonPartyName: env.CANTON_PARTY,
    cantonUserId:    env.CANTON_USER_ID,
    apiUrl:          env.API_URL,
  }),
  createService: (config) => new ConsoleService(config),
});