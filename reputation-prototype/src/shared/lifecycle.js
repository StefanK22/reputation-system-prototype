export const parseNum = (v, fb) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : fb; };
export const createPort = (v, fb) => Math.floor(parseNum(v, fb));

export async function runService({ createConfig, createService, env = process.env }) {
  const service = createService(createConfig(env));
  await service.start();
  process.on('SIGINT',  () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}