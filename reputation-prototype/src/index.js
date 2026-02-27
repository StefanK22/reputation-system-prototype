import { createApiServer } from './api/server.js';
import { ReputationEngine } from './engine/reputationEngine.js';
import { MockLedger } from './ledger/mockLedger.js';
import { seedContracts } from './demo/seedContracts.js';
import { InMemoryReadModelStore } from './store/readModelStore.js';

const ledger = new MockLedger();
const store = new InMemoryReadModelStore();
const engine = new ReputationEngine({ ledger, store });

seedContracts(ledger);
const initialStats = engine.processNewEvents();

const port = Number(process.env.PORT || 8080);
const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS || 3000);
const disableHttp = process.env.DISABLE_HTTP === '1';

let server = null;
if (!disableHttp) {
  server = createApiServer({ ledger, store, engine });
  server.on('error', (error) => {
    console.error('HTTP server failed to start:', error.message);
    console.log('Run with DISABLE_HTTP=1 to execute engine-only mode.');
  });
  server.listen(port, () => {
    console.log(`Reputation prototype listening on http://localhost:${port}`);
    console.log('Initial processing stats:', initialStats);
    console.log('Try: GET /rankings, GET /reputation/AGENT_ALICE, GET /config');
  });
} else {
  console.log('HTTP server disabled (DISABLE_HTTP=1).');
  console.log('Initial processing stats:', initialStats);
}

setInterval(() => {
  const stats = engine.processNewEvents();
  if (stats.consumedEvents > 0) {
    console.log('Processed new ledger events:', stats);
  }
}, pollIntervalMs);
