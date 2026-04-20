import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { wrapFetchWithPayment, decodeXPaymentResponse } from 'x402-fetch';

const REGISTRY_URL = process.env.REGISTRY_URL || 'http://localhost:4000';
const PAYER_PRIVATE_KEY = process.env.PAYER_PRIVATE_KEY;

let paidFetch = fetch;
let payerAddress = null;
if (PAYER_PRIVATE_KEY) {
  const account = privateKeyToAccount(PAYER_PRIVATE_KEY);
  payerAddress = account.address;
  const walletClient = createWalletClient({ account, transport: http(), chain: baseSepolia });
  paidFetch = wrapFetchWithPayment(fetch, walletClient);
}

async function j(url, options = {}, fetchFn = fetch) {
  const r = await fetchFn(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : {};
  if (!r.ok) {
    const err = new Error(`${url} → ${r.status}: ${JSON.stringify(data)}`);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  const payResp = r.headers.get('x-payment-response');
  if (payResp) {
    try { data.__payment = decodeXPaymentResponse(payResp); } catch {}
  }
  return data;
}

async function emit(type, payload) {
  try {
    await fetch(`${REGISTRY_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload }),
    });
  } catch {}
}

const CITIES = ['Roma', 'Milano', 'Napoli', 'Torino', 'Firenze', 'Bologna', 'Venezia', 'Genova', 'Palermo', 'Bari'];

const TASKS = [
  ...CITIES.map((city) => ({
    label: `meteo a ${city}`,
    capability: 'get_weather',
    input: { city },
    evaluate: evaluateWeather,
  })),
  {
    label: 'converti 100 EUR in USD',
    capability: 'convert_currency',
    input: { from: 'EUR', to: 'USD', amount: 100 },
    evaluate: () => ({ ok: true, score: 5, reason: 'ok' }),
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
    evaluate: () => ({ ok: true, score: 4, reason: 'ok' }),
  },
];

function evaluateWeather(output) {
  if (!output) return { ok: false, score: 1, reason: 'empty response' };
  const { temp_c, conditions } = output;
  if (typeof temp_c !== 'number' || temp_c < -50 || temp_c > 60) {
    return { ok: false, score: 1, reason: `invalid temp_c=${temp_c}` };
  }
  if (!conditions || conditions === '???' || conditions.length > 20) {
    return { ok: false, score: 1, reason: `invalid conditions="${conditions}"` };
  }
  return { ok: true, score: 5, reason: 'ok' };
}

function chooseProvider(services) {
  // Exploration phase: always try providers with zero ratings first (epsilon-greedy-ish).
  // Once every provider has been sampled at least once, pick by reputation + small jitter.
  const untested = services.filter((s) => !s.ratings_count || s.ratings_count === 0);
  if (untested.length) {
    return untested[Math.floor(Math.random() * untested.length)];
  }
  return [...services]
    .map((s) => ({ s, k: (s.reputation_score || 0) + Math.random() * 0.05 }))
    .sort((a, b) => b.k - a.k)[0].s;
}

async function runTask(creds, task, idx) {
  const requestId = `req-${idx.toString().padStart(3, '0')}-${Date.now().toString(36)}`;
  console.log(`\n── TASK ${idx + 1}: ${task.label} ──`);
  console.log(`  [discover] capability=${task.capability}`);
  const services = await j(
    `${REGISTRY_URL}/discover?capability=${task.capability}&sort=reputation`
  );
  if (!services.length) {
    console.error(`  nessun servizio per ${task.capability}, skip`);
    await emit('task_failed', { request_id: requestId, capability: task.capability, reason: 'no providers' });
    return;
  }
  await emit('task_start', {
    request_id: requestId,
    label: task.label,
    capability: task.capability,
    input: task.input,
    candidates: services.map((s) => ({
      service_id: s.id,
      name: s.name,
      reputation: s.reputation_score,
      uptime: s.uptime_score || 0,
      price: s.pricing?.per_call || 0,
    })),
  });

  const chosen = chooseProvider(services);
  console.log(
    `  [choose]   ${chosen.name} · reputation=${chosen.reputation_score.toFixed(3)} · uptime=${(chosen.uptime_score || 0).toFixed(2)}`
  );
  await emit('chose', {
    request_id: requestId,
    capability: task.capability,
    service_id: chosen.id,
    service_name: chosen.name,
    reputation: chosen.reputation_score,
    rejected: services.filter((s) => s.id !== chosen.id).map((s) => ({ service_id: s.id, name: s.name, reputation: s.reputation_score })),
  });

  const t0 = Date.now();
  let result = null;
  let invokeError = null;
  try {
    result = await j(
      `${chosen.endpoint}/invoke`,
      { method: 'POST', body: { capability: task.capability, input: task.input } },
      paidFetch,
    );
  } catch (e) {
    invokeError = e;
  }
  const latency_ms = Date.now() - t0;

  if (invokeError) {
    console.log(`  [invoke]   FAILED after ${latency_ms}ms → ${invokeError.message.slice(0, 120)}`);
    await emit('invoke_done', {
      request_id: requestId,
      service_id: chosen.id,
      service_name: chosen.name,
      ok: false,
      latency_ms,
      reason: invokeError.message.slice(0, 200),
    });
    await j(`${REGISTRY_URL}/services/${chosen.id}/rate`, {
      method: 'POST',
      body: {
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        score: 1,
        comment: `invocation failed: ${invokeError.message.slice(0, 80)}`,
      },
    });
    console.log(`  [rate]     score=1 (invocation failed)`);
    return;
  }

  const { __payment, ...output } = result;
  if (__payment) {
    console.log(`  [pay]      tx=${__payment.transaction} on ${__payment.network}`);
    await emit('payment', {
      request_id: requestId,
      service_id: chosen.id,
      service_name: chosen.name,
      tx: __payment.transaction,
      network: __payment.network,
      payer: __payment.payer,
    });
  }
  const evalResult = task.evaluate ? task.evaluate(output) : { ok: true, score: 5, reason: 'ok' };
  console.log(`  [invoke]   ${latency_ms}ms → ${evalResult.ok ? 'ok' : 'BAD: ' + evalResult.reason}`);
  await emit('invoke_done', {
    request_id: requestId,
    service_id: chosen.id,
    service_name: chosen.name,
    ok: evalResult.ok,
    latency_ms,
    output,
    quality_reason: evalResult.reason,
  });

  await j(`${REGISTRY_URL}/services/${chosen.id}/report`, {
    method: 'POST',
    body: {
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      ok: evalResult.ok,
      latency_ms,
    },
  });

  await j(`${REGISTRY_URL}/services/${chosen.id}/rate`, {
    method: 'POST',
    body: {
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      score: evalResult.score,
      comment: `demo task: ${task.label} — ${evalResult.reason}`,
    },
  });
  console.log(`  [rate]     score=${evalResult.score} (${evalResult.reason})`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  console.log('[client-multi] credenziali...');
  const creds = await j(`${REGISTRY_URL}/clients`, { method: 'POST' });
  console.log(`              client_id=${creds.client_id}`);
  if (payerAddress) {
    console.log(`              x402 payer=${payerAddress} on base-sepolia`);
  } else {
    console.log('              x402 disabled (PAYER_PRIVATE_KEY not set)');
  }
  for (let i = 0; i < TASKS.length; i++) {
    await runTask(creds, TASKS[i], i);
    await sleep(900); // pacing so the dashboard feed is readable
  }
  console.log(`\n[client-multi] done — ${TASKS.length} task completati`);
}

main().catch((e) => {
  console.error('[client-multi] errore:', e.message);
  process.exit(1);
});
