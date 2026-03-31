import { ReputationEngine } from './core.js';
import { LedgerClient } from '../../shared/ledger.js';
import { DB } from '../../shared/db.js';
import { runService } from '../../shared/lifecycle.js';

class EngineWorker {
  constructor({ cantonApiUrl, databaseUrl, cantonPartyName, cantonUserId }) {
    this.cantonApiUrl    = cantonApiUrl;
    this.databaseUrl     = databaseUrl;
    this.cantonPartyName = cantonPartyName;  // display name e.g. "Operator"
    this.cantonUserId    = cantonUserId;
    this.db              = null;
    this.ledger          = null;
    this.engine          = null;
    this.stopped         = false;
    this.abort           = null;
  }

  async start() {
    this.db = new DB({ connectionString: this.databaseUrl });

    let partyId;
    while (true) {
      try {
        partyId = await LedgerClient.getOperatorPartyId(this.cantonApiUrl);
        break;
      } catch (e) {
        console.log(`Waiting for Canton JSON API (${e.message}) — retrying in 3s`);
        await new Promise((r) => setTimeout(r, 3_000));
      }
    }

    this.ledger = new LedgerClient({ baseUrl: this.cantonApiUrl, party: partyId, userId: this.cantonUserId });
    this.engine = new ReputationEngine({ ledger: this.ledger, db: this.db, operator: partyId });

    await this.db.ensureReady();
    await this.engine.init();
    console.log('Engine worker started — listening to Canton event stream');
    this._run();
  }

  async _run() {
    while (!this.stopped) {
      this.abort = new AbortController();
      try {
        const stats = await this.engine.processNewEvents(this.abort.signal);
        if (stats.consumed > 0) console.log('Processed events:', stats);
      } catch (e) {
        if (this.stopped) break;
        console.error('Stream error:', e.message);
        await new Promise((r) => setTimeout(r, 1_000));
      } finally {
        this.abort = null;
      }
    }
    console.log('Engine worker stopped');
  }

  async stop(signal = 'SIGTERM') {
    console.log(`Stopping engine worker (${signal})`);
    this.stopped = true;
    this.abort?.abort();
    await this.db?.close();
  }
}

runService({
  createConfig: (env) => ({
    cantonApiUrl:    env.CANTON_API_URL,
    databaseUrl:     env.DATABASE_URL,
    cantonPartyName: env.CANTON_PARTY,
    cantonUserId:    env.CANTON_USER_ID
  }),
  createService: (config) => new EngineWorker(config),
});
