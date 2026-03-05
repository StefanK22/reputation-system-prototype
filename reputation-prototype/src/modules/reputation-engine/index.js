import { createReputationEngineConfig, ReputationEngineService } from './service.js';
import { runService } from '../../shared/runtime/lifecycle.js';

await runService({
  createConfig: createReputationEngineConfig,
  createService: (config) => new ReputationEngineService(config),
});
