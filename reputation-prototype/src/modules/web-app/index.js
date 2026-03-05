import { createWebAppConfig, WebAppService } from './service.js';
import { runService } from '../../shared/runtime/lifecycle.js';

await runService({
  createConfig: createWebAppConfig,
  createService: (config) => new WebAppService(config),
});
