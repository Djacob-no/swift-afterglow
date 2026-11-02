// MOCK DATA, shaped like the planned grbs.json / predictions.json / tle.json / status.json.
// Random bursts are fake; highlight positions and values are approximate placeholders.
// The real build script will replace all of this with the NASA Swift GRB table.

export const TIMELINE_START = Date.UTC(2004, 11, 17);
export const TIMELINE_END = Date.UTC(2026, 9, 17, 23, 59);
export const DAY = 86400000;
export const SPAN_DAYS = (TIMELINE_END - TIMELINE_START) / DAY;
export const TOTAL = 2046;

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(28485);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

export const HIGHLIGHTS = [
  { id: '221009A', t: Date.UTC(2022, 9, 9, 14, 10, 17), ra: 288.264, dec: 19.773, t90: 1068.4, fluence: 740, z: 0.151, zRaw: '0.151 (spectroscopic)', zType: 'spec',
    title: 'The BOAT', blurb: '"Brightest Of All Time". So bright it disturbed Earth\'s ionosphere.' },
  { id: '090423', t: Date.UTC(2009, 3, 23, 7, 55, 19), ra: 148.889, dec: 18.149, t90: 10.3, fluence: 5.9, z: 8.0, zRaw: '8.0 (MPI/ESO: photometric)|~8.1 (TNG)', zType: 'phot',
    title: 'From the cosmic dawn', blurb: 'Light that left when the universe was ~630 million years old.' },
  { id: '050904', t: Date.UTC(2005, 8, 4, 1, 51, 44), ra: 13.716, dec: 14.087, t90: 225, fluence: 48.3, z: 6.29, zRaw: '6.29', zType: 'spec',
    title: 'Distance record, 2005', blurb: 'The most distant explosion known when Swift caught it.' },
  { id: '130427A', t: Date.UTC(2013, 3, 27, 7, 47, 57), ra: 173.137, dec: 27.699, t90: 162.8, fluence: 349, z: 0.34, zRaw: '0.34', zType: 'spec',
    title: 'Nearby monster', blurb: 'One of the most energetic bursts ever seen, unusually close.' },
  { id: '080319B', t: Date.UTC(2008, 2, 19, 6, 12, 49), ra: 217.92, dec: 36.302, t90: 124.9, fluence: 81, z: 0.937, zRaw: '0.937', zType: 'spec',
    title: 'The naked-eye burst', blurb: 'Briefly visible to the unaided eye from 7.5 billion light-years. (unverified)' },
];

function gcnFor(t) {
  const f = (t - TIMELINE_START) / (TIMELINE_END - TIMELINE_START);
  const base = Math.round(2900 + f * 39000 + rand() * 40);
  const n = 1 + Math.floor(rand() * 4);
  return Array.from({ length: n }, (_, k) => base + k * (1 + Math.floor(rand() * 6)));
}

function makeBurst(t) {
  const zU = rand() * 2 - 1, phi = rand() * Math.PI * 2;
  const dec = Math.asin(zU) * 180 / Math.PI;
  const ra = phi * 180 / Math.PI;
  const isShort = rand() < 0.1;
  const t90 = rand() < 0.2 ? null
    : isShort ? Math.max(0.03, Math.exp(Math.log(0.4) + gauss() * 0.8))
    : Math.max(2.1, Math.exp(Math.log(55) + gauss() * 1.0));
  const fluence = Math.min(600, Math.max(0.08, Math.exp(Math.log(isShort ? 1.5 : 9) + gauss() * 1.25)));
  const hasZ = rand() < 0.23;
  const z = hasZ ? +(Math.exp(Math.log(1.8) + gauss() * 0.6)).toFixed(3) : null;
  const pr = rand();
  const posSrc = pr < 0.3 ? 'UVOT' : pr < 0.8 ? 'XRT' : 'BAT';
  return {
    t, ra: +ra.toFixed(4), dec: +dec.toFixed(4), posSrc,
    err: posSrc === 'BAT' ? +(1 + rand() * 2.5).toFixed(1) + '′' : posSrc === 'XRT' ? +(1.4 + rand() * 4).toFixed(1) + '″' : +(0.3 + rand() * 0.5).toFixed(1) + '″',
    t90: t90 == null ? null : +t90.toFixed(2),
    fluence: +fluence.toFixed(2),
    peakFlux: +(fluence * (0.05 + rand() * 0.3)).toFixed(2),
    z, zRaw: z == null ? null : (rand() < 0.3 ? `${z} (photometric)` : `${z}`), zType: z == null ? null : 'spec',
    xrt: posSrc !== 'BAT' || rand() < 0.4,
    uvot: posSrc === 'UVOT',
  };
}

function nameFor(t, letterIdx, forceLetter) {
  const d = new Date(t);
  const s = String(d.getUTCFullYear()).slice(2) + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
  return forceLetter || letterIdx > 0 ? s + String.fromCharCode(65 + letterIdx) : s;
}

function build() {
  const list = [];
  for (let i = 0; i < TOTAL - HIGHLIGHTS.length; i++) {
    list.push(makeBurst(TIMELINE_START + rand() * (TIMELINE_END - TIMELINE_START)));
  }
  for (const h of HIGHLIGHTS) {
    list.push({ ...makeBurst(h.t), ...h, posSrc: 'UVOT', err: '0.5″', xrt: true, uvot: true, highlight: true });
  }
  list.sort((a, b) => a.t - b.t);
  // assign GRB names: YYMMDD + letter (letters always from 2010 on)
  const byDay = new Map();
  for (const b of list) {
    const key = Math.floor(b.t / DAY);
    const k = byDay.get(key) ?? 0;
    byDay.set(key, k + 1);
    if (!b.highlight) b.id = nameFor(b.t, k, new Date(b.t).getUTCFullYear() >= 2010);
    b.gcn = gcnFor(b.t);
    b.iso = new Date(b.t).toISOString().replace('.000', '');
  }
  list.forEach((b, i) => (b.idx = i));
  return list;
}

export const GRBS = build();

export const PREDICTIONS = [
  { source: 'Aerospace CORDS', url: 'https://aerospace.org/reentries/28485', center: '2026-11-04T09:30:00Z', start: '2026-11-03T07:30:00Z', end: '2026-11-05T11:30:00Z', note: '±26 h · stale epoch' },
  { source: 'Michigan SWORD', url: 'https://tohuvavohu.com/swift-last-light/', center: '2026-11-03T17:33:00Z', start: '2026-11-03T09:31:00Z', end: '2026-11-04T01:31:00Z', note: '90% window' },
  { source: 'US Space Force', url: 'https://fly-marshall.com/article/nasa-swift-observatory-reentry-nov6-swft06', center: '2026-11-06T12:00:00Z', start: '2026-11-06T00:00:00Z', end: '2026-11-06T23:59:00Z', note: '"on or around Nov 6"', fuzzy: true },
];

export const TLE = {
  epoch: '2026-11-01T22:16:00Z',
  meanMotion: 16.204, // rev/day
  inclination: 20.55,
  raan: 137.2, // mock
  argLat0: 40, // mock
  altitudeKm: 210,
};

export const STATUS = { mode: 'live', reentryTime: null, source: null };

export const MISSION = {
  launch: '2004-11-20T17:16:00Z',
  nasaStatement: 'https://science.nasa.gov/blogs/swift/2026/10/23/nasas-swift-mission-ends-ahead-of-re-entry/',
};
