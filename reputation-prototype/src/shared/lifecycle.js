export const parseNum  = (v, fb) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : fb; };
export const createPort = (v, fb) => Math.floor(parseNum(v, fb));

export async function runService({ createConfig, createService, env = process.env }) {
  const service = createService(createConfig(env));
  await service.start();

  let stopping = false;
  const stop = async (signal) => {
    if (stopping) return;
    stopping = true;
    try   { await service.stop(signal); process.exit(0); }
    catch (e) { console.error(e.message); process.exit(1); }
  };

  process.on('SIGINT',  () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}