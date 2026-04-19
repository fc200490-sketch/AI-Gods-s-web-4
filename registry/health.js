import { readJson, writeJson } from './storage.js';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MS = 60 * 1000;

async function ping(service) {
  const start = Date.now();
  try {
    const ctl = AbortSignal.timeout(5000);
    const res = await fetch(`${service.endpoint}/manifest`, { method: 'GET', signal: ctl });
    return { ok: res.ok, latency: Date.now() - start };
  } catch {
    return { ok: false, latency: Date.now() - start };
  }
}

async function tick() {
  const services = readJson('registry.json', []);
  if (!services.length) return;
  const now = Date.now();
  for (const s of services) {
    const result = await ping(s);
    s.health = (s.health || []).filter((h) => now - h.ts < WINDOW_MS);
    s.health.push({ ts: now, ok: result.ok, latency: result.latency });
    const okCount = s.health.filter((h) => h.ok).length;
    s.uptime_score = s.health.length ? okCount / s.health.length : 0;
  }
  writeJson('registry.json', services);
}

export function startHealthLoop() {
  let warmup = 5;
  async function loop() {
    await tick();
    const delay = warmup > 0 ? 1000 : INTERVAL_MS;
    if (warmup > 0) warmup--;
    setTimeout(loop, delay);
  }
  loop();
}
