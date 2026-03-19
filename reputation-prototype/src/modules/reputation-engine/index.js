import { ReputationEngine } from './core.js';
import { LedgerClient } from '../../shared/ledger.js';
import { DB } from '../../shared/db.js';
import { runService } from '../../shared/lifecycle.js';

class EngineWorker {
  constructor({ cantonApiUrl, databaseUrl, cantonParty, cantonUserId }) {
    this.db      = new DB({ connectionString: databaseUrl });
    this.ledger  = new LedgerClient({ baseUrl: cantonApiUrl, party: cantonParty, userId: cantonUserId });
    this.engine  = new ReputationEngine({ ledger: this.ledger, db: this.db });
    this.stopped = false;
    this.abort   = null;
  }

  async start() {
    await this.db.ensureReady();
    await this.engine.init();
    console.log('Engine worker started — listening to Canton event stream');
    this._run(); // fire-and-forget; process stays alive via signal handlers
  }

  // Core event loop. Calls streamFrom() which blocks until events arrive
  // (long-poll) or the 30s server timeout elapses, then loops immediately.
  // No timer, no arbitrary interval — the cadence is driven by ledger activity.
  async _run() {
    while (!this.stopped) {
      this.abort = new AbortController();
      try {
        const stats = await this.engine.processNewEvents(this.abort.signal);
        if (stats.consumed > 0) console.log('Processed events:', stats);
      } catch (e) {
        if (this.stopped) break;
        console.error('Stream error:', e.message);
        // Brief pause only on unexpected errors, not on normal empty responses
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
    this.abort?.abort(); // cancel any in-flight long-poll
    await this.db.close();
  }
}

runService({
  createConfig: (env) => ({
    cantonApiUrl:  env.CANTON_API_URL,
    databaseUrl:   env.DATABASE_URL,
    cantonParty:   env.CANTON_PARTY,
    cantonUserId:  env.CANTON_USER_ID
  }),
  createService: (config) => new EngineWorker(config),
});