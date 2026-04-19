const REGISTRY_URL = process.env.REGISTRY_URL || 'http://localhost:4000';

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

const TASKS = [
  {
    label: 'meteo a Roma',
    capability: 'get_weather',
    input: { city: 'Roma' },
    rating: 5,
  },
  {
    label: 'converti 100 EUR in USD',
    capability: 'convert_currency',
    input: { from: 'EUR', to: 'USD', amount: 100 },
    rating: 5,
  },
  {
    label: 'riassumi un testo',
    capability: 'summarize_text',
    input: {
      text:
        'Il Web 4 è una visione in cui ogni servizio espone un manifest machine-readable ' +
        'con capability, schema I/O e prezzo, consentendo agli agenti AI di scoprire, ' +
        'invocare e pagare servizi in autonomia, senza scraping su UI pensate per umani.',
      max_words: 15,
    },
    rating: 4,
  },
];

async function runTask(creds, task) {
  console.log(`\n── TASK: ${task.label} ──`);
  console.log(`  [discover] capability=${task.capability}`);
  const services = await j(
    `${REGISTRY_URL}/discover?capability=${task.capability}&sort=reputation`
  );
  if (!services.length) {
    console.error(`  nessun servizio per ${task.capability}, skip`);
    return;
  }
  const chosen = services[0];
  console.log(
    `  [choose]   ${chosen.name} · reputation=${chosen.reputation_score.toFixed(3)} · uptime=${(chosen.uptime_score || 0).toFixed(2)}`
  );
  const t0 = Date.now();
  const result = await j(`${chosen.endpoint}/invoke`, {
    method: 'POST',
    body: { capability: task.capability, input: task.input },
  });
  const latency_ms = Date.now() - t0;
  console.log(`  [invoke]   ${latency_ms}ms →`, result);
  await j(`${REGISTRY_URL}/services/${chosen.id}/report`, {
    method: 'POST',
    body: {
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      ok: true,
      latency_ms,
    },
  });
  await j(`${REGISTRY_URL}/services/${chosen.id}/rate`, {
    method: 'POST',
    body: {
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      score: task.rating,
      comment: `demo task: ${task.label}`,
    },
  });
  console.log(`  [report+rate] ok (score=${task.rating})`);
}

async function main() {
  console.log('[client-multi] credenziali...');
  const creds = await j(`${REGISTRY_URL}/clients`, { method: 'POST' });
  console.log(`              client_id=${creds.client_id}`);
  for (const task of TASKS) {
    await runTask(creds, task);
  }
  console.log('\n[client-multi] done — 3 task completati con discovery multi-capability');
}

main().catch((e) => {
  console.error('[client-multi] errore:', e.message);
  process.exit(1);
});
