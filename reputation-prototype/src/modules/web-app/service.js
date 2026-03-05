import { createApiServer } from './server.js';
import { CantonApiLedgerClient } from '../../shared/clients/cantonApiLedgerClient.js';
import { PostgresReadModelStore } from '../../shared/store/postgresReadModelStore.js';
import { EngineApiClient } from './engineApiClient.js';
import { createPort } from '../../shared/runtime/lifecycle.js';

export function createWebAppConfig(env = process.env) {
  return {
    port: createPort(env.PORT, 8080),
    cantonApiUrl: env.CANTON_API_URL || 'http://canton-node:7575',
    engineApiUrl: env.ENGINE_API_URL || 'http://reputation-engine:9091',
    databaseUrl:
      env.DATABASE_URL || 'postgresql://reputation:reputation_password@database:5432/reputation',
    cantonParty: env.CANTON_PARTY || 'OPERATOR',
    cantonUserId: env.CANTON_USER_ID || 'operator-user',
  };
}

export class WebAppService {
  constructor(config) {
    this.config = config;
    this.server = null;
    this.store = new PostgresReadModelStore({ connectionString: config.databaseUrl });
    this.ledger = new CantonApiLedgerClient({
      baseUrl: config.cantonApiUrl,
      party: config.cantonParty,
      userId: config.cantonUserId,
    });
    this.engine = new EngineApiClient({
      baseUrl: config.engineApiUrl,
    });
  }

  async start() {
    await this.store.ensureReady();
    this.server = createApiServer({
      ledger: this.ledger,
      store: this.store,
      engine: this.engine,
    });

    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.config.port, resolve);
    });

    console.log(`Reputation web app listening on http://localhost:${this.config.port}`);
    console.log('Try: GET /rankings, GET /reputation/AGENT_ALICE, GET /config');
  }

  async stop(signal = 'SIGTERM') {
    console.log(`Received ${signal}, shutting down web app...`);
    if (this.server) {
      await new Promise((resolve) => this.server.close(resolve));
    }
    await this.store.close();
  }
}
