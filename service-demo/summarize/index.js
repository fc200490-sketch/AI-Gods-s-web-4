import express from 'express';
import { renderLanding } from '../_lib/landing.js';

const PORT = Number(process.env.PORT || 4102);
const ENDPOINT = process.env.ENDPOINT || `http://localhost:${PORT}`;
const REGISTRY_URL = process.env.REGISTRY_URL || 'http://localhost:4000';
const OWNER_SECRET = process.env.OWNER_SECRET || 'summarize-demo-secret';

const manifest = {
  name: 'summarize-demo',
  description: 'Riassume un testo troncandolo a N parole (demo, niente LLM)',
  endpoint: ENDPOINT,
  capabilities: [
    {
      name: 'summarize_text',
      description: 'Ritorna le prime max_words parole del testo con "..." finale',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', minLength: 1 },
          max_words: { type: 'integer', minimum: 1, default: 20 },
        },
        required: ['text'],
      },
      output_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          original_words: { type: 'integer' },
          summary_words: { type: 'integer' },
        },
        required: ['summary', 'original_words', 'summary_words'],
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
  if (capability !== 'summarize_text') {
    return res.status(400).json({ error: `unknown capability: ${capability}` });
  }
  const text = input?.text;
  const max_words = input?.max_words ?? 20;
  if (!text) return res.status(400).json({ error: 'input.text required' });
  const words = text.trim().split(/\s+/);
  const summaryWords = words.slice(0, max_words);
  const summary =
    summaryWords.join(' ') + (words.length > max_words ? '...' : '');
  res.json({
    summary,
    original_words: words.length,
    summary_words: summaryWords.length,
  });
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
    if (r.ok) console.log(`[summarize] registered with registry, id=${data.id}`);
    else console.warn(`[summarize] registry returned ${r.status}:`, data);
  } catch (e) {
    console.warn('[summarize] could not reach registry:', e.message);
  }
}

app.listen(PORT, () => {
  console.log(`[summarize] listening on ${ENDPOINT}`);
  registerWithRegistry();
});
