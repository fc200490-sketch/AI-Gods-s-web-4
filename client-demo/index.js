const REGISTRY_URL = process.env.REGISTRY_URL || 'http://localhost:4000';
const CITY = process.env.CITY || 'Roma';

async function j(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error(`${url} → ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  console.log('[client] 1. creo credenziali client...');
  const creds = await j(`${REGISTRY_URL}/clients`, { method: 'POST' });
  console.log(`         client_id=${creds.client_id}`);

  console.log('[client] 2. discovery — capability=get_weather, sort=reputation...');
  const services = await j(`${REGISTRY_URL}/discover?capability=get_weather&sort=reputation`);
  if (!services.length) {
    console.error('         nessun servizio trovato. Avvia: npm run weather');
    process.exit(1);
  }
  const chosen = services[0];
  console.log(`         scelto: ${chosen.name} (id=${chosen.id}, reputation=${chosen.reputation_score.toFixed(3)})`);

  console.log('[client] 3. leggo manifest del service...');
  const manifest = await j(`${chosen.endpoint}/manifest`);
  console.log(`         capabilities: ${manifest.capabilities.map((c) => c.name).join(', ')}`);

  console.log(`[client] 4. invoke get_weather(city="${CITY}")...`);
  const t0 = Date.now();
  const result = await j(`${chosen.endpoint}/invoke`, {
    method: 'POST',
    body: { capability: 'get_weather', input: { city: CITY } },
  });
  const latency_ms = Date.now() - t0;
  console.log(`         risposta:`, result, `(${latency_ms}ms)`);

  console.log('[client] 5. report della call al registry...');
  await j(`${REGISTRY_URL}/services/${chosen.id}/report`, {
    method: 'POST',
    body: {
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      ok: true,
      latency_ms,
    },
  });

  console.log('[client] 6. lascio rating 5...');
  await j(`${REGISTRY_URL}/services/${chosen.id}/rate`, {
    method: 'POST',
    body: {
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      score: 5,
      comment: 'demo ok',
    },
  });

  console.log('[client] done — flow discovery → invoke → report → rate OK');
}

main().catch((e) => {
  console.error('[client] errore:', e.message);
  process.exit(1);
});
