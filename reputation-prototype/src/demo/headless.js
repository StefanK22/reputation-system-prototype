import { createRuntime } from '../runtime/bootstrap.js';

const { store, initialStats: stats } = createRuntime();

console.log('Headless demo complete');
console.log(JSON.stringify({
  stats,
  activeConfig: store.getActiveConfiguration(),
  rankings: store.getRankings(10),
  agent: store.getSubject('AGENT_ALICE'),
}, null, 2));
