#!/usr/bin/env node
// Builds public/data/grbs.json + highlights.json from NASA's Swift GRB table.
// The table has no CORS headers, so this runs at build time. A committed snapshot
// (data/raw/grb_table.tsv) is used when the live fetch fails or with --offline.
//
//   node scripts/build-data.mjs            # fetch live, refresh snapshot
//   node scripts/build-data.mjs --offline  # use the committed snapshot only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = path.join(ROOT, 'data/raw/grb_table.tsv');
const OUT = path.join(ROOT, 'public/data');
const BASE = 'https://swift.gsfc.nasa.gov/archive/grb_table/';
const offline = process.argv.includes('--offline');

// ---------- fetch ----------
async function fetchTable() {
  const ua = { headers: { 'User-Agent': 'swift-afterglow-build (static site prebuild)' } };
  const page = await (await fetch(BASE + 'fullview/', ua)).text();
  const m = page.match(/href="([^"]*grb_table\/tmp\/grb_table_\d+\.txt)"/);
  if (!m) throw new Error('could not find TSV link on fullview/');
  const url = new URL(m[1], BASE).href;
  const res = await fetch(url, ua);
  if (!res.ok) throw new Error(`TSV fetch failed: ${res.status}`);
  const text = await res.text();
  if (!text.startsWith('GRB\t')) throw new Error('TSV does not look like the GRB table');
  return { text, url };
}

let tsv, source;
if (!offline) {
  try {
    const { text, url } = await fetchTable();
    fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
    fs.writeFileSync(SNAPSHOT, text);
    tsv = text; source = url;
    console.log(`fetched live table: ${url}`);
  } catch (e) {
    console.warn(`live fetch failed (${e.message}); falling back to snapshot`);
  }
}
if (!tsv) {
  tsv = fs.readFileSync(SNAPSHOT, 'utf8');
  source = 'snapshot:data/raw/grb_table.tsv';
}

// ---------- parse helpers ----------
const NA = (s) => s == null || /^\s*(n\/a|)\s*$/i.test(s);
/** "12.5" → {v:12.5}; "~60" → {v:60, q:'~'}; ">360" → {v:360, q:'>'}; else null */
function num(s) {
  if (NA(s)) return null;
  const m = String(s).trim().match(/^([~<>])?\s*(-?\d+(?:\.\d+)?)$/);
  return m ? { v: +m[2], q: m[1] ?? null } : null;
}
/** sexagesimal "19:13:03.85" → degrees (hours=true multiplies by 15) */
function sexa(s, hours) {
  if (NA(s)) return null;
  const m = String(s).trim().match(/^([+-])?(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const v = (+m[2] + +m[3] / 60 + +m[4] / 3600) * (m[1] === '-' ? -1 : 1);
  return hours ? v * 15 : v;
}
/** Prefer a clean spectroscopic value, else the first clean value. */
function redshift(s) {
  if (NA(s)) return { z: null, zType: null };
  const parts = s.split('|');
  const clean = parts
    .map((p) => ({ p, m: p.trim().match(/^~?(\d+(?:\.\d+)?)\s*(\(|$)/) }))
    .filter((x) => x.m);
  const spec = clean.find((x) => !/photometric/i.test(x.p));
  const pick = spec ?? clean[0];
  if (!pick) return { z: null, zType: null };
  return { z: +pick.m[1], zType: /photometric/i.test(pick.p) ? 'phot' : 'spec' };
}
function dateFromName(id, time) {
  const m = id.match(/^(\d\d)(\d\d)(\d\d)/);
  if (!m) return null;
  const [, yy, mm, dd] = m;
  const t = /^\d\d:\d\d:\d\d/.test(time) ? time.slice(0, 8) : '12:00:00';
  return `20${yy}-${mm}-${dd}T${t}Z`;
}
const round = (v, d) => (v == null ? null : +v.toFixed(d));

// ---------- parse ----------
const lines = tsv.split(/\r?\n/).filter((l) => l.trim());
const header = lines[0].split('\t');
if (header.length !== 35 || header[0] !== 'GRB' || header[30] !== 'Redshift') throw new Error('unexpected header layout');

const bursts = [];
for (const line of lines.slice(1)) {
  const c = line.split('\t');
  while (c.length < 35) c.push('');
  const id = c[0].trim();
  const timeKnown = /^\d\d:\d\d:\d\d/.test(c[1].trim());
  const iso = dateFromName(id, c[1].trim());

  const bat = { ra: num(c[3])?.v ?? null, dec: num(c[4])?.v ?? null, err: num(c[5])?.v ?? null };
  const xrt = { ra: sexa(c[13], true), dec: sexa(c[14], false), err: num(c[15])?.v ?? null };
  const uvot = { ra: sexa(c[23], true), dec: sexa(c[24], false), err: num(c[25])?.v ?? null };
  // best available position: UVOT > XRT > BAT (errors: UVOT/XRT arcsec, BAT arcmin → store arcsec)
  let pos = null;
  if (uvot.ra != null && uvot.dec != null) pos = { ra: uvot.ra, dec: uvot.dec, src: 'UVOT', errArcsec: uvot.err };
  else if (xrt.ra != null && xrt.dec != null) pos = { ra: xrt.ra, dec: xrt.dec, src: 'XRT', errArcsec: xrt.err };
  else if (bat.ra != null && bat.dec != null) pos = { ra: bat.ra, dec: bat.dec, src: 'BAT', errArcsec: bat.err != null ? bat.err * 60 : null };

  const t90 = num(c[6]), flu = num(c[7]), peak = num(c[9]), xdt = num(c[16]);
  const { z, zType } = redshift(c[30]);
  const gcn = [...new Set([...c[33].matchAll(/GCN\s*(\d+)/g)].map((m) => +m[1]))];

  bursts.push({
    id, t: iso, timeKnown, trigger: c[2].trim() || null,
    ra: round(pos?.ra, 4), dec: round(pos?.dec, 4), posSrc: pos?.src ?? null, errArcsec: round(pos?.errArcsec, 2),
    t90: t90?.v ?? null, t90Q: t90?.q ?? (NA(c[6]) ? null : (t90 ? null : c[6].trim())),
    fluence: flu?.v ?? null, fluenceQ: flu?.q ?? null,
    peakFlux: peak?.v ?? null,
    z, zType, zRaw: NA(c[30]) ? null : c[30].trim(),
    xrt: xrt.ra != null, uvot: uvot.ra != null,
    xrtDelay: xdt?.v ?? null,
    otherObs: NA(c[29]) ? null : c[29].trim(),
    host: NA(c[31]) ? null : c[31].trim(),
    gcn, advocate: NA(c[34]) ? null : c[34].trim(),
  });
}
bursts.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.id < b.id ? -1 : 1));

// ---------- validate ----------
const problems = [];
const ids = new Set();
for (const b of bursts) {
  if (ids.has(b.id)) problems.push(`duplicate id ${b.id}`);
  ids.add(b.id);
  if (!b.t || Number.isNaN(Date.parse(b.t))) problems.push(`bad date ${b.id}`);
  if (b.ra != null && (b.ra < 0 || b.ra >= 360)) problems.push(`RA out of range ${b.id} ${b.ra}`);
  if (b.dec != null && (b.dec < -90 || b.dec > 90)) problems.push(`Dec out of range ${b.id} ${b.dec}`);
}
if (bursts.length < 2000) problems.push(`only ${bursts.length} rows`);
const nulls = (k) => bursts.filter((b) => b[k] == null).length;
console.log(`rows: ${bursts.length}  (${bursts[0].id} → ${bursts.at(-1).id})`);
console.log(`nulls: position ${nulls('ra')}, t90 ${nulls('t90')}, fluence ${nulls('fluence')}, peakFlux ${nulls('peakFlux')}, z ${nulls('z')}, time-of-day unknown ${bursts.filter((b) => !b.timeKnown).length}`);
console.log(`position source: UVOT ${bursts.filter((b) => b.posSrc === 'UVOT').length}, XRT ${bursts.filter((b) => b.posSrc === 'XRT').length}, BAT ${bursts.filter((b) => b.posSrc === 'BAT').length}`);
const delays = bursts.map((b) => b.xrtDelay).filter((v) => v != null).sort((a, b) => a - b);
console.log(`XRT time to first observation: median ${delays[delays.length >> 1]} s (n=${delays.length})`);

// ---------- highlights (every value checked against the table) ----------
const HIGHLIGHTS = [
  { id: '221009A', title: 'The BOAT', blurb: '"Brightest Of All Time". The brightest gamma-ray burst ever recorded, estimated as a once-in-10,000-years event.', url: 'https://www.jpl.nasa.gov/news/brightest-cosmic-explosion-ever-detected-had-other-unique-features/' },
  { id: '090423', title: 'From the cosmic dawn', blurb: 'At redshift about 8, its light set out roughly 13 billion years ago, when the universe was about 630 million years old.', url: 'https://www3.nasa.gov/mission_pages/swift/bursts/cosmic_record.html' },
  { id: '050904', title: 'Distance record, 2005', blurb: 'At redshift 6.29, the most distant explosion known when Swift caught it.', url: 'https://arxiv.org/abs/astro-ph/0509766' },
  { id: '130427A', title: 'Nearby monster', blurb: 'One of the most energetic bursts ever seen, and unusually close, at redshift 0.34.', url: 'https://www.nasa.gov/universe/nasa-sees-watershed-cosmic-blast-in-unique-detail/' },
  { id: '080319B', title: 'The naked-eye burst', blurb: 'Its optical flash was briefly bright enough to see without a telescope, from 7.5 billion light-years away.', url: 'https://www3.nasa.gov/centers/goddard/news/topstory/2008/brightest_grb.html' },
  { id: '060614', title: 'The burst that broke the rules', blurb: 'A long burst with no supernova, which challenged the simple long/short picture.', url: 'https://swift.gsfc.nasa.gov/results/publist/Gehrels_Nature_444_1044_2006.pdf' },
];
for (const h of HIGHLIGHTS) if (!ids.has(h.id)) problems.push(`highlight ${h.id} missing from table`);

if (problems.length) {
  console.error('VALIDATION FAILED:\n  ' + problems.join('\n  '));
  process.exit(1);
}

// ---------- write (columnar, compact) ----------
const FIELDS = ['id', 't', 'timeKnown', 'trigger', 'ra', 'dec', 'posSrc', 'errArcsec', 't90', 't90Q', 'fluence', 'fluenceQ', 'peakFlux',
  'z', 'zType', 'zRaw', 'xrt', 'uvot', 'xrtDelay', 'otherObs', 'host', 'gcn', 'advocate'];
fs.mkdirSync(OUT, { recursive: true });
const grbs = { source, builtAt: new Date().toISOString(), count: bursts.length, fields: FIELDS, rows: bursts.map((b) => FIELDS.map((f) => b[f])) };
fs.writeFileSync(path.join(OUT, 'grbs.json'), JSON.stringify(grbs));
fs.writeFileSync(path.join(OUT, 'highlights.json'), JSON.stringify(HIGHLIGHTS, null, 2) + '\n');
const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + ' KB';
console.log(`wrote public/data/grbs.json (${kb('grbs.json')}), highlights.json`);
