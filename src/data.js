// Loads the prebuilt data files from public/data (see scripts/build-data.mjs, fetch-tle.mjs, build-stars.mjs).

const DAY = 86400000;

async function getJSON(name) {
  const res = await fetch(`/data/${name}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`failed to load ${name}.json (${res.status})`);
  return res.json();
}

export async function loadData() {
  const [grbs, highlights, predictions, tle, status, stars] = await Promise.all(
    ['grbs', 'highlights', 'predictions', 'tle', 'status', 'stars'].map(getJSON),
  );

  const F = grbs.fields;
  const GRBS = grbs.rows.map((row, idx) => {
    const g = Object.fromEntries(F.map((f, i) => [f, row[i]]));
    g.iso = g.t;
    g.t = Date.parse(g.t);
    g.idx = idx;
    return g;
  });

  // the timeline runs from the day of the first burst to the last one
  const first = new Date(GRBS[0].t);
  const TIMELINE_START = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
  const TIMELINE_END = GRBS.at(-1).t + DAY / 2;

  return {
    GRBS,
    HIGHLIGHTS: highlights,
    PREDICTIONS: predictions.predictions,
    PREDICTIONS_UPDATED: predictions.updated,
    TLE: tle,
    STATUS: status,
    STARS: stars.rows,
    TIMELINE_START,
    TIMELINE_END,
    SPAN_DAYS: (TIMELINE_END - TIMELINE_START) / DAY,
    TOTAL: GRBS.length,
    DAY,
  };
}
