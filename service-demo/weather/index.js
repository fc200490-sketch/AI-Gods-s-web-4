import express from 'express';
import { paymentMiddleware } from 'x402-express';
import { renderLanding } from '../_lib/landing.js';

const PORT = Number(process.env.PORT || 4100);
const ENDPOINT = process.env.ENDPOINT || `http://localhost:${PORT}`;
const REGISTRY_URL = process.env.REGISTRY_URL || 'http://localhost:4000';
const OWNER_SECRET = process.env.OWNER_SECRET || 'weather-demo-secret';
const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS;
const X402_NETWORK = process.env.X402_NETWORK || 'base-sepolia';
const X402_FACILITATOR_URL = process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator';
const PRICE_USD = '$0.001';

const manifest = {
  name: 'weather-demo',
  description: 'Servizio demo che ritorna meteo finto per una città',
  endpoint: ENDPOINT,
  capabilities: [
    {
      name: 'get_weather',
      description: 'Ritorna il meteo corrente per una città',
      input_schema: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
      output_schema: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          temp_c: { type: 'number' },
          conditions: { type: 'string' },
        },
        required: ['city', 'temp_c', 'conditions'],
      },
    },
  ],
  pricing: { per_call: 0.001, currency: 'USDC', network: X402_NETWORK },
};

const app = express();

app.get('/', (_req, res) => {
  res.type('html').send(renderLanding(manifest, { registryUrl: REGISTRY_URL }));
});

app.get('/manifest', (_req, res) => res.json(manifest));
app.get('/.well-known/agent.json', (_req, res) => res.json(manifest));

if (RECEIVER_ADDRESS) {
  app.use(
    paymentMiddleware(
      RECEIVER_ADDRESS,
      {
        'POST /invoke': {
          price: PRICE_USD,
          network: X402_NETWORK,
          config: { description: 'weather-demo get_weather call' },
        },
      },
      { url: X402_FACILITATOR_URL },
    ),
  );
  console.log(`[weather] x402 paywall active: ${PRICE_USD} → ${RECEIVER_ADDRESS}`);
} else {
  console.warn('[weather] RECEIVER_ADDRESS not set — /invoke is FREE (x402 disabled)');
}

app.use(express.json());

app.post('/invoke', (req, res) => {
  const { capability, input } = req.body || {};
  if (capability !== 'get_weather') {
    return res.status(400).json({ error: `unknown capability: ${capability}` });
  }
  const city = input?.city;
  if (!city) return res.status(400).json({ error: 'input.city required' });
  const conditions = ['sunny', 'cloudy', 'rainy', 'snowy'][Math.floor(Math.random() * 4)];
  const temp_c = Math.round((Math.random() * 30 - 5) * 10) / 10;
  res.json({ city, temp_c, conditions });
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
    if (r.ok) {
      console.log(`[weather] registered with registry, id=${data.id}`);
    } else {
      console.warn(`[weather] registry returned ${r.status}:`, data);
    }
  } catch (e) {
    console.warn('[weather] could not reach registry:', e.message);
  }
}

app.listen(PORT, () => {
  console.log(`[weather] listening on ${ENDPOINT}`);
  registerWithRegistry();
});
