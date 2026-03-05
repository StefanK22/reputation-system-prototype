function registerShutdownHooks(onShutdown) {
  let shuttingDown = false;

  async function run(signal) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    try {
      await onShutdown(signal);
    } catch (error) {
      console.error(`Shutdown failed on ${signal}:`, error.message);
      process.exit(1);
    }
  }

  process.on('SIGINT', () => run('SIGINT'));
  process.on('SIGTERM', () => run('SIGTERM'));
}

export function parsePositiveNumber(envValue, fallback) {
  const parsed = Number(envValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createPort(envValue, fallback) {
  return Math.floor(parsePositiveNumber(envValue, fallback));
}

export async function runService({ createConfig, createService, env = process.env }) {
  const service = createService(createConfig(env));
  await service.start();

  registerShutdownHooks(async (signal) => {
    await service.stop(signal);
    process.exit(0);
  });

  return service;
}
