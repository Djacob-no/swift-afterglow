#!/usr/bin/env node
// Builds public/data/stars.json from the Yale Bright Star Catalogue, 5th ed.
// (Hoffleit & Warren 1991), as distributed by the Harvard TDC. J2000 positions, V magnitude.
//   node scripts/build-stars.mjs [path/to/bsc5.dat.gz]

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_URL = 'http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz';
const OUT = path.join(ROOT, 'public/data/stars.json');
const MAG_LIMIT = 6.5;

let gz;
if (process.argv[2]) gz = fs.readFileSync(process.argv[2]);
else gz = Buffer.from(await (await fetch(SRC_URL, { signal: AbortSignal.timeout(60000) })).arrayBuffer());
const text = zlib.gunzipSync(gz).toString('latin1');

// fixed-width columns (1-indexed, from the BSC5 ReadMe)
const col = (line, a, b) => line.slice(a - 1, b).trim();
const stars = [];
for (const line of text.split(/\r?\n/)) {
  if (line.length < 107) continue;
  const rah = col(line, 76, 77), ram = col(line, 78, 79), ras = col(line, 80, 83);
  const sgn = col(line, 84, 84), ded = col(line, 85, 86), dem = col(line, 87, 88), des = col(line, 89, 90);
  const vmag = col(line, 103, 107);
  if (!rah || !ded || !vmag) continue; // a handful of entries (novae, non-stellar) have no position
  const ra = (+rah + +ram / 60 + +ras / 3600) * 15;
  const dec = (+ded + +dem / 60 + +des / 3600) * (sgn === '-' ? -1 : 1);
  const v = +vmag;
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(v) || v > MAG_LIMIT) continue;
  stars.push([+ra.toFixed(3), +dec.toFixed(3), +v.toFixed(2)]);
}
if (stars.length < 8000) throw new Error(`only parsed ${stars.length} stars`);

// sanity: Polaris (HR 424) should sit near Dec +89.26, Sirius is the brightest (V -1.46)
const brightest = stars.reduce((a, b) => (b[2] < a[2] ? b : a));
const polaris = stars.find((s) => s[1] > 89);
console.log(`stars: ${stars.length} (V ≤ ${MAG_LIMIT}); brightest ${JSON.stringify(brightest)}; near pole ${JSON.stringify(polaris)}`);

fs.writeFileSync(OUT, JSON.stringify({
  source: 'Yale Bright Star Catalogue, 5th Revised Ed. (Hoffleit & Warren 1991), via Harvard TDC',
  url: 'http://tdc-www.harvard.edu/catalogs/bsc5.html',
  fields: ['ra', 'dec', 'vmag'], rows: stars,
}));
console.log(`wrote public/data/stars.json (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
