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

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await service.stop(signal);
      process.exit(0);
    } catch (error) {
      console.error(`Shutdown failed on ${signal}:`, error.message);
      process.exit(1);
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return service;
}
