import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { readJson, writeJson } from './storage.js';
import { compositeScore } from './reputation.js';
import { startHealthLoop } from './health.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4000;
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Live event bus (SSE) ───────────────────────────────────────────
const EVENT_BUFFER_MAX = 100;
const eventBuffer = [];
const sseClients = new Set();

function broadcastEvent(evt) {
  const enriched = { ...evt, ts: evt.ts || new Date().toISOString(), seq: eventBuffer.length + 1 };
  eventBuffer.push(enriched);
  if (eventBuffer.length > EVENT_BUFFER_MAX) eventBuffer.shift();
  const line = `data: ${JSON.stringify(enriched)}\n\n`;
  for (const res of sseClients) {
    try { res.write(line); } catch {}
  }
  return enriched;
}

const loadServices = () => readJson('registry.json', []);
const saveServices = (s) => writeJson('registry.json', s);
const loadClients = () => readJson('clients.json', []);
const saveClients = (c) => writeJson('clients.json', c);
const loadRatings = () => readJson('ratings.json', []);
const saveRatings = (r) => writeJson('ratings.json', r);

function hydrate(service) {
  const ratings = loadRatings().filter((r) => r.service_id === service.id);
  const reputation_score = compositeScore({
    uptime_score: service.uptime_score || 0,
    ratings,
    call_count: service.call_count || 0,
  });
  const avg_latency_ms = service.health?.length
    ? Math.round(service.health.reduce((s, h) => s + h.latency, 0) / service.health.length)
    : null;
  const { owner_secret_hash, health, ...pub } = service;
  return { ...pub, avg_latency_ms, ratings_count: ratings.length, reputation_score };
}

async function fetchCanonicalManifest(endpoint) {
  try {
    const url = new URL('/.well-known/agent.json', endpoint).toString();
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { ok: false, reason: `HTTP ${r.status}` };
    return { ok: true, manifest: await r.json() };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function verifyOwner(service, secret) {
  if (!secret) return false;
  return bcrypt.compare(secret, service.owner_secret_hash);
}

async function verifyClient(client_id, client_secret) {
  const c = loadClients().find((x) => x.client_id === client_id);
  if (!c) return false;
  return bcrypt.compare(client_secret, c.secret_hash);
}

app.post('/clients', async (_req, res) => {
  const client_id = crypto.randomUUID();
  const client_secret = crypto.randomBytes(24).toString('hex');
  const secret_hash = await bcrypt.hash(client_secret, 8);
  const clients = loadClients();
  clients.push({ client_id, secret_hash, registered_at: new Date().toISOString() });
  saveClients(clients);
  res.status(201).json({ client_id, client_secret });
});

app.post('/register', async (req, res) => {
  const { name, description, endpoint, capabilities, pricing, owner_secret } = req.body || {};
  if (!name || !endpoint || !Array.isArray(capabilities) || !owner_secret) {
    return res.status(400).json({ error: 'missing fields: name, endpoint, capabilities, owner_secret' });
  }
  const canonical = await fetchCanonicalManifest(endpoint);
  if (!canonical.ok) {
    return res.status(400).json({
      error: `cannot verify canonical manifest at ${endpoint}/.well-known/agent.json: ${canonical.reason}`,
    });
  }
  if (canonical.manifest.name !== name) {
    return res.status(400).json({
      error: `canonical manifest name mismatch: remote says "${canonical.manifest.name}", registration says "${name}"`,
    });
  }
  const canonicalCaps = new Set((canonical.manifest.capabilities || []).map((c) => c.name));
  const missing = capabilities.map((c) => c.name).filter((n) => !canonicalCaps.has(n));
  if (missing.length) {
    return res.status(400).json({
      error: `canonical manifest missing declared capabilities: ${missing.join(', ')}`,
    });
  }
  const id = crypto.randomUUID();
  const owner_secret_hash = await bcrypt.hash(owner_secret, 8);
  const service = {
    id,
    name,
    description: description || '',
    endpoint,
    capabilities,
    pricing: pricing || { per_call: 0, currency: 'USDC' },
    owner_secret_hash,
    registered_at: new Date().toISOString(),
    uptime_score: 0,
    call_count: 0,
    health: [],
  };
  const services = loadServices();
  services.push(service);
  saveServices(services);
  broadcastEvent({
    type: 'service_registered',
    payload: { service_id: id, name, endpoint, capabilities: capabilities.map((c) => c.name) },
  });
  res.status(201).json({ id, message: 'registered' });
});

app.post('/events', (req, res) => {
  const { type, payload } = req.body || {};
  if (!type) return res.status(400).json({ error: 'missing type' });
  const evt = broadcastEvent({ type, payload: payload || {} });
  res.status(201).json({ ok: true, seq: evt.seq });
});

app.get('/events/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`: connected\n\n`);
  for (const e of eventBuffer.slice(-30)) {
    res.write(`data: ${JSON.stringify(e)}\n\n`);
  }
  sseClients.add(res);
  const keepAlive = setInterval(() => {
    try { res.write(`: keep-alive\n\n`); } catch {}
  }, 15000);
  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

app.get('/events', (_req, res) => res.json(eventBuffer));

app.get('/discover', (req, res) => {
  const { capability, sort } = req.query;
  let services = loadServices().map(hydrate);
  if (capability) {
    services = services.filter((s) => s.capabilities.some((c) => c.name === capability));
  }
  if (sort === 'reputation') {
    services.sort((a, b) => b.reputation_score - a.reputation_score);
  }
  res.json(services);
});

app.get('/services/:id', (req, res) => {
  const s = loadServices().find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json(hydrate(s));
});

app.delete('/services/:id', async (req, res) => {
  const owner_secret = req.header('X-Owner-Secret');
  const services = loadServices();
  const idx = services.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  if (!(await verifyOwner(services[idx], owner_secret))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  services.splice(idx, 1);
  saveServices(services);
  res.json({ message: 'deleted' });
});

app.patch('/services/:id', async (req, res) => {
  const owner_secret = req.header('X-Owner-Secret');
  const services = loadServices();
  const service = services.find((x) => x.id === req.params.id);
  if (!service) return res.status(404).json({ error: 'not found' });
  if (!(await verifyOwner(service, owner_secret))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { name, description, endpoint, capabilities, pricing } = req.body || {};
  if (name) service.name = name;
  if (description !== undefined) service.description = description;
  if (endpoint) service.endpoint = endpoint;
  if (capabilities) service.capabilities = capabilities;
  if (pricing) service.pricing = pricing;
  saveServices(services);
  res.json(hydrate(service));
});

app.post('/services/:id/rate', async (req, res) => {
  const { client_id, client_secret, score, comment } = req.body || {};
  if (!client_id || !client_secret || !score) {
    return res.status(400).json({ error: 'missing fields: client_id, client_secret, score' });
  }
  if (score < 1 || score > 5) {
    return res.status(400).json({ error: 'score must be in [1,5]' });
  }
  if (!(await verifyClient(client_id, client_secret))) {
    return res.status(401).json({ error: 'invalid client credentials' });
  }
  const service = loadServices().find((x) => x.id === req.params.id);
  if (!service) return res.status(404).json({ error: 'service not found' });
  const ratings = loadRatings();
  ratings.push({
    service_id: req.params.id,
    client_id,
    score,
    comment: comment || null,
    ts: new Date().toISOString(),
  });
  saveRatings(ratings);
  broadcastEvent({
    type: 'rated',
    payload: { service_id: req.params.id, service_name: service.name, score, comment: comment || null },
  });
  res.status(201).json({ message: 'rated' });
});

app.post('/services/:id/report', async (req, res) => {
  const { client_id, client_secret, ok, latency_ms } = req.body || {};
  if (!(await verifyClient(client_id, client_secret))) {
    return res.status(401).json({ error: 'invalid client credentials' });
  }
  const services = loadServices();
  const service = services.find((x) => x.id === req.params.id);
  if (!service) return res.status(404).json({ error: 'service not found' });
  if (ok) {
    service.call_count = (service.call_count || 0) + 1;
    service.reported_calls = [...(service.reported_calls || []), { ts: Date.now(), latency_ms }].slice(-200);
  }
  saveServices(services);
  res.json({ message: 'recorded' });
});

app.listen(PORT, () => {
  console.log(`[registry] listening on http://localhost:${PORT}`);
  startHealthLoop();
});
