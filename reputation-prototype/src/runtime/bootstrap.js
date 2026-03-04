import { ReputationEngine } from '../engine/reputationEngine.js';
import { MockLedger } from '../ledger/mockLedger.js';
import { seedContracts } from '../demo/seedContracts.js';
import { InMemoryReadModelStore } from '../store/readModelStore.js';

export function createRuntime(options = {}) {
  const { seed = true } = options;

  const ledger = new MockLedger();
  const store = new InMemoryReadModelStore();
  const engine = new ReputationEngine({ ledger, store });

  if (seed) {
    seedContracts(ledger);
  }

  const initialStats = engine.processNewEvents();

  return {
    ledger,
    store,
    engine,
    initialStats,
  };
}
