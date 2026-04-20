import express from 'express';
import { paymentMiddleware } from 'x402-express';
import { renderLanding } from '../_lib/landing.js';

const PORT = Number(process.env.PORT || 4100);
const ENDPOINT = process.env.ENDPOINT || `http://localhost:${PORT}`;
const REGISTRY_URL = process.env.REGISTRY_URL || 'http://localhost:4000';
const SERVICE_NAME = process.env.SERVICE_NAME || 'weather-demo';
const SERVICE_DESCRIPTION = process.env.SERVICE_DESCRIPTION || 'Servizio demo che ritorna meteo finto per una città';
const OWNER_SECRET = process.env.OWNER_SECRET || `${SERVICE_NAME}-secret`;
const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS;
const X402_NETWORK = process.env.X402_NETWORK || 'base-sepolia';
const X402_FACILITATOR_URL = process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator';
const PRICE_USD_STR = process.env.PRICE_USD || '$0.001';
const PRICE_USD_NUM = Number(PRICE_USD_STR.replace('$', ''));
const BEHAVIOR = process.env.BEHAVIOR || 'good'; // good | bugged | slow
const LOG_TAG = `[${SERVICE_NAME}]`;

const manifest = {
  name: SERVICE_NAME,
  description: SERVICE_DESCRIPTION,
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
  pricing: { per_call: PRICE_USD_NUM, currency: 'USDC', network: X402_NETWORK },
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
          price: PRICE_USD_STR,
          network: X402_NETWORK,
          config: { description: `${SERVICE_NAME} get_weather call` },
        },
      },
      { url: X402_FACILITATOR_URL },
    ),
  );
  console.log(`${LOG_TAG} x402 paywall active: ${PRICE_USD_STR} → ${RECEIVER_ADDRESS}`);
} else {
  console.warn(`${LOG_TAG} RECEIVER_ADDRESS not set — /invoke is FREE (x402 disabled)`);
}

app.use(express.json());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.post('/invoke', async (req, res) => {
  const { capability, input } = req.body || {};
  if (capability !== 'get_weather') {
    return res.status(400).json({ error: `unknown capability: ${capability}` });
  }
  const city = input?.city;
  if (!city) return res.status(400).json({ error: 'input.city required' });

  if (BEHAVIOR === 'slow') {
    await sleep(2500 + Math.random() * 1500);
  }

  if (BEHAVIOR === 'bugged') {
    // 40% of the time return obviously garbage data; 20% error out; 40% fine
    const dice = Math.random();
    if (dice < 0.4) {
      return res.json({ city, temp_c: -999, conditions: '???' });
    }
    if (dice < 0.6) {
      return res.status(500).json({ error: 'internal error (bugged provider)' });
    }
  }

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
      console.log(`${LOG_TAG} registered with registry, id=${data.id}`);
    } else {
      console.warn(`${LOG_TAG} registry returned ${r.status}:`, data);
    }
  } catch (e) {
    console.warn(`${LOG_TAG} could not reach registry:`, e.message);
  }
}

app.listen(PORT, () => {
  console.log(`${LOG_TAG} listening on ${ENDPOINT} (behavior=${BEHAVIOR})`);
  registerWithRegistry();
});
