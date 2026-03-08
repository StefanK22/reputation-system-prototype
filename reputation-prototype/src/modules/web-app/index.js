import { createServer } from './routes.js';
import { LedgerClient } from '../../shared/ledger.js';
import { DB } from '../../shared/db.js';
import { createPort, runService } from '../../shared/lifecycle.js';

class WebAppService {
  constructor({ port, cantonApiUrl, engineApiUrl, databaseUrl, cantonParty, cantonUserId }) {
    this.port   = port;
    this.db     = new DB({ connectionString: databaseUrl });
    this.ledger = new LedgerClient({ baseUrl: cantonApiUrl, party: cantonParty, userId: cantonUserId });
    this.server = createServer({ db: this.db, ledger: this.ledger, engineUrl: engineApiUrl });
  }

  async start() {
    await this.db.ensureReady();
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(this.port, resolve); });
    console.log(`Web app on :${this.port}  →  http://localhost:${this.port}`);
  }

  async stop(signal = 'SIGTERM') {
    console.log(`Stopping web app (${signal})`);
    await new Promise((r) => this.server.close(r));
    await this.db.close();
  }
}

runService({
  createConfig: (env) => ({
    port:          createPort(env.PORT, 8080),
    cantonApiUrl:  env.CANTON_API_URL  || 'http://canton-node:7575',
    engineApiUrl:  env.ENGINE_API_URL  || 'http://reputation-engine:9091',
    databaseUrl:   env.DATABASE_URL    || 'postgresql://reputation:reputation_password@database:5432/reputation',
    cantonParty:   env.CANTON_PARTY    || 'OPERATOR',
    cantonUserId:  env.CANTON_USER_ID  || 'operator-user',
  }),
  createService: (config) => new WebAppService(config),
});