#!/usr/bin/env node
// Fetches Swift's latest TLE from CelesTrak into public/data/tle.json.
// CelesTrak asks clients not to poll more than every ~2 h, so this refuses to refetch
// within 2 h of the last fetch unless --force is given.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/data/tle.json');
const URL_TLE = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=28485&FORMAT=TLE';
const MIN_INTERVAL_MS = 2 * 3600 * 1000;

if (fs.existsSync(OUT) && !process.argv.includes('--force')) {
  const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const age = Date.now() - Date.parse(prev.fetchedAt);
  if (age < MIN_INTERVAL_MS) {
    console.log(`tle.json is ${(age / 60000).toFixed(0)} min old; skipping (use --force to override)`);
    process.exit(0);
  }
}

/** TLE epoch "26305.92752005" → ISO UTC */
function tleEpochToIso(field) {
  const yy = +field.slice(0, 2), doy = +field.slice(2);
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return new Date(Date.UTC(year, 0, 1) + (doy - 1) * 86400000).toISOString();
}

const res = await fetch(URL_TLE, { headers: { 'User-Agent': 'swift-afterglow-build' }, signal: AbortSignal.timeout(45000) });
if (!res.ok) throw new Error(`CelesTrak returned ${res.status}`);
const lines = (await res.text()).split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
const l1 = lines.find((l) => l.startsWith('1 28485'));
const l2 = lines.find((l) => l.startsWith('2 28485'));
if (!l1 || !l2) {
  // No record usually means the object has decayed — a reentry signal, so say so loudly.
  console.error('No TLE for 28485 returned. Swift may have reentered; check Space-Track/Aerospace before flipping status.json.');
  process.exit(2);
}
const tle = {
  name: 'SWIFT', norad: 28485,
  line1: l1, line2: l2,
  epoch: tleEpochToIso(l1.slice(18, 32).trim()),
  fetchedAt: new Date().toISOString(),
  source: URL_TLE,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(tle, null, 2) + '\n');
console.log(`wrote tle.json, epoch ${tle.epoch}`);
