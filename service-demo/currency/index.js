import express from 'express';
import { renderLanding } from '../_lib/landing.js';

const PORT = Number(process.env.PORT || 4101);
const ENDPOINT = process.env.ENDPOINT || `http://localhost:${PORT}`;
const REGISTRY_URL = process.env.REGISTRY_URL || 'http://localhost:4000';
const OWNER_SECRET = process.env.OWNER_SECRET || 'currency-demo-secret';

const RATES = {
  EUR: { USD: 1.08, GBP: 0.85, JPY: 164.2, CHF: 0.96 },
  USD: { EUR: 0.93, GBP: 0.79, JPY: 152.0, CHF: 0.89 },
  GBP: { EUR: 1.17, USD: 1.27, JPY: 193.1, CHF: 1.13 },
};

const manifest = {
  name: 'currency-demo',
  description: 'Conversione valute con tassi statici (demo)',
  endpoint: ENDPOINT,
  capabilities: [
    {
      name: 'convert_currency',
      description: 'Converte un importo da una valuta a un\'altra',
      input_schema: {
        type: 'object',
        properties: {
          from: { type: 'string', minLength: 3, maxLength: 3 },
          to: { type: 'string', minLength: 3, maxLength: 3 },
          amount: { type: 'number' },
        },
        required: ['from', 'to', 'amount'],
      },
      output_schema: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          amount: { type: 'number' },
          converted: { type: 'number' },
          rate: { type: 'number' },
        },
        required: ['from', 'to', 'amount', 'converted', 'rate'],
      },
    },
  ],
  pricing: { per_call: 0, currency: 'USDC' },
};

const app = express();
app.use(express.json());

app.get('/', (_req, res) => {
  res.type('html').send(renderLanding(manifest, { registryUrl: REGISTRY_URL }));
});

app.get('/manifest', (_req, res) => res.json(manifest));

app.post('/invoke', (req, res) => {
  const { capability, input } = req.body || {};
  if (capability !== 'convert_currency') {
    return res.status(400).json({ error: `unknown capability: ${capability}` });
  }
  const { from, to, amount } = input || {};
  if (!from || !to || typeof amount !== 'number') {
    return res.status(400).json({ error: 'input requires {from, to, amount}' });
  }
  const F = from.toUpperCase();
  const T = to.toUpperCase();
  if (F === T) return res.json({ from: F, to: T, amount, converted: amount, rate: 1 });
  const rate = RATES[F]?.[T];
  if (!rate) return res.status(400).json({ error: `pair ${F}->${T} not supported` });
  const converted = Math.round(amount * rate * 100) / 100;
  res.json({ from: F, to: T, amount, converted, rate });
});

async function registerWithRegistry() {
  try {
    const r = await fetch(`${REGISTRY_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: manifest.name,
        description: manifest.description,
        endpoint: manifest.endpoint,
        capabilities: manifest.capabilities,
        pricing: manifest.pricing,
        owner_secret: OWNER_SECRET,
      }),
    });
    const data = await r.json();
    if (r.ok) console.log(`[currency] registered with registry, id=${data.id}`);
    else console.warn(`[currency] registry returned ${r.status}:`, data);
  } catch (e) {
    console.warn('[currency] could not reach registry:', e.message);
  }
}

app.listen(PORT, () => {
  console.log(`[currency] listening on ${ENDPOINT}`);
  registerWithRegistry();
});
