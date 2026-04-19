import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });

function pathFor(file) {
  return path.join(DATA_DIR, file);
}

export function readJson(file, fallback) {
  const p = pathFor(file);
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.writeFileSync(pathFor(file), JSON.stringify(data, null, 2));
}

export function appendLine(file, entry) {
  fs.appendFileSync(pathFor(file), JSON.stringify(entry) + '\n');
}

export function readLines(file) {
  const p = pathFor(file);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}
