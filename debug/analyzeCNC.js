import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cncPath = path.resolve(__dirname, '..', '..', 'Descargas', 'javier mdf bco (1).002');
const content = fs.readFileSync(cncPath, 'utf8');

const lines = content.split(/\r?\n/);
const datiLines = [];
const riferimentiLines = [];
let section = null;
for (const line of lines) {
  if (line.startsWith('[Dati]')) {
    section = 'dati';
    continue;
  }
  if (line.startsWith('[Riferimenti]')) {
    section = 'riferimenti';
    continue;
  }
  if (line.startsWith('[') && !line.startsWith('[Dati]') && !line.startsWith('[Riferimenti]')) {
    section = null;
  }
  if (!section) continue;
  if (!/^[0-9]+=/.test(line)) continue;
  if (section === 'dati') {
    datiLines.push(line);
  } else if (section === 'riferimenti') {
    riferimentiLines.push(line);
  }
}

function parseDati(lines) {
  return lines.map((line) => {
    const [, right] = line.split('=');
    const parts = right.split(',').map((part) => part.trim());
    const width = parseFloat(parts[1]);
    const height = parseFloat(parts[2]);
    return { width, height };
  });
}

function parseRiferimenti(lines) {
  return lines.map((line) => {
    const [, right] = line.split('=');
    const parts = right.split(',').map((part) => part.trim());
    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    return { x, y };
  });
}

const dati = parseDati(datiLines);
const riferimenti = parseRiferimenti(riferimentiLines);

const placements = dati.map((d, idx) => ({
  ...d,
  ...riferimenti[idx],
}));

console.log('Total placements:', placements.length);
console.log('Unique X positions:', Array.from(new Set(placements.map((p) => p.x))).length);
console.log('X positions:', Array.from(new Set(placements.map((p) => p.x))).sort((a, b) => a - b));
console.log('Y positions per X:');
const byX = new Map();
for (const placement of placements) {
  if (!byX.has(placement.x)) byX.set(placement.x, []);
  byX.get(placement.x).push(placement.y);
}
for (const [x, ys] of byX.entries()) {
  console.log(x, ys.sort((a, b) => a - b));
}

// Export placements for further analysis
export default placements;
