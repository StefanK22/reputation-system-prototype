import { ReputationEngine } from '../engine/reputationEngine.js';
import { MockLedger } from '../ledger/mockLedger.js';
import { seedContracts } from './seedContracts.js';
import { InMemoryReadModelStore } from '../store/readModelStore.js';

const ledger = new MockLedger();
const store = new InMemoryReadModelStore();
const engine = new ReputationEngine({ ledger, store });

seedContracts(ledger);
const stats = engine.processNewEvents();

console.log('Headless demo complete');
console.log(JSON.stringify({
  stats,
  activeConfig: store.getActiveConfiguration(),
  rankings: store.getRankings(10),
  agent: store.getSubject('AGENT_ALICE'),
}, null, 2));
