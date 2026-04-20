import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const COLORS = {
  registry: '\x1b[36m',
  'weather-premium': '\x1b[32m',
  'weather-standard': '\x1b[92m',
  'weather-bugged': '\x1b[31m',
  currency: '\x1b[33m',
  summarize: '\x1b[35m',
  client: '\x1b[37m',
};
const RESET = '\x1b[0m';

const children = [];

function pipe(tag, stream) {
  const color = COLORS[tag] || '';
  let buf = '';
  stream.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (line) process.stdout.write(`${color}[${tag}]${RESET} ${line}\n`);
    }
  });
}

function run(tag, script, env = {}) {
  const child = spawn('node', ['--env-file=.env', path.join(root, script)], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipe(tag, child.stdout);
  pipe(tag, child.stderr);
  children.push(child);
  return child;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cleanup() {
  for (const c of children) {
    try {
      c.kill();
    } catch {}
  }
}

function resetState() {
  const dataDir = path.join(root, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  for (const f of ['registry.json', 'clients.json', 'ratings.json']) {
    fs.writeFileSync(path.join(dataDir, f), '[]');
  }
  console.log('[demo-all] state wiped — registry starts empty');
}

process.on('SIGINT', () => {
  console.log('\n[demo-all] shutdown...');
  cleanup();
  process.exit(0);
});

async function main() {
  resetState();

  console.log('[demo-all] avvio registry...');
  run('registry', 'registry/index.js');
  await sleep(1200);

  console.log('[demo-all] avvio 3 weather providers + currency + summarize...');
  // Tre weather providers con comportamenti diversi → stessa capability get_weather
  run('weather-premium', 'service-demo/weather/index.js', {
    PORT: '4100',
    SERVICE_NAME: 'weather-premium',
    SERVICE_DESCRIPTION: 'Provider meteo premium — dati realistici, sempre online',
    BEHAVIOR: 'good',
    PRICE_USD: '$0.002',
  });
  run('weather-standard', 'service-demo/weather/index.js', {
    PORT: '4110',
    SERVICE_NAME: 'weather-standard',
    SERVICE_DESCRIPTION: 'Provider meteo standard — dati realistici, prezzo base',
    BEHAVIOR: 'good',
    PRICE_USD: '$0.001',
  });
  run('weather-bugged', 'service-demo/weather/index.js', {
    PORT: '4120',
    SERVICE_NAME: 'weather-bugged',
    SERVICE_DESCRIPTION: 'Provider meteo instabile — spesso ritorna dati sbagliati',
    BEHAVIOR: 'bugged',
    PRICE_USD: '$0.001',
  });
  run('currency', 'service-demo/currency/index.js');
  run('summarize', 'service-demo/summarize/index.js');

  // Attesa extra: lasciamo che registry health-check tocchi tutti i servizi almeno 1 volta
  await sleep(4500);

  console.log('[demo-all] lancio client multi-task...\n');
  const client = run('client', 'client-demo/multi.js');

  client.on('exit', (code) => {
    console.log('\n' + '─'.repeat(60));
    console.log(`[demo-all] client exited (${code}). Registry + services restano attivi.`);
    console.log('[demo-all] ▶ Dashboard:  \x1b[36mhttp://localhost:4000\x1b[0m');
    console.log('[demo-all] ▶ Per rilanciare i task:  npm run demo:multi');
    console.log('[demo-all] ▶ Ferma tutto con Ctrl+C');
    console.log('─'.repeat(60) + '\n');
  });
}

main();
