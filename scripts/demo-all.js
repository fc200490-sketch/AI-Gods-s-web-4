import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const COLORS = {
  registry: '\x1b[36m',
  weather: '\x1b[32m',
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
  const child = spawn('node', [path.join(root, script)], {
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

process.on('SIGINT', () => {
  console.log('\n[demo-all] shutdown...');
  cleanup();
  process.exit(0);
});

async function main() {
  console.log('[demo-all] avvio registry...');
  run('registry', 'registry/index.js');
  await sleep(1000);

  console.log('[demo-all] avvio services (weather, currency, summarize)...');
  run('weather', 'service-demo/weather/index.js');
  run('currency', 'service-demo/currency/index.js');
  run('summarize', 'service-demo/summarize/index.js');
  await sleep(2500);

  console.log('[demo-all] lancio client multi-task...\n');
  const client = run('client', 'client-demo/multi.js');

  client.on('exit', (code) => {
    console.log('\n' + '─'.repeat(60));
    console.log(`[demo-all] client exited (${code}). Registry + service restano attivi.`);
    console.log('[demo-all] ▶ Dashboard:  \x1b[36mhttp://localhost:4000\x1b[0m');
    console.log('[demo-all] ▶ Per rilanciare i task:  npm run demo:multi');
    console.log('[demo-all] ▶ Ferma tutto con Ctrl+C');
    console.log('─'.repeat(60) + '\n');
  });
}

main();
