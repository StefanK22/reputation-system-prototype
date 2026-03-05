import { createCantonNodeConfig, MockCantonNodeService } from './service.js';
import { runService } from '../../shared/runtime/lifecycle.js';

await runService({
  createConfig: createCantonNodeConfig,
  createService: (config) => new MockCantonNodeService(config),
});
