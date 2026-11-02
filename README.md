# Swift Afterglow

A three.js tribute to NASA's Neil Gehrels Swift Observatory: every gamma-ray burst in Swift's GRB table,
replayed on the sky around a 3D Earth, with Swift's real (decaying) orbit and reentry forecasts.

Two views: **Tribute** (Play on the start card: song-synced cinematic, cues in `src/cinematic.js`) and
**Explore** (technical HUD: timeline, filters, burst details, live orbit panel).

```
npm install
npm run dev            # http://localhost:5173
npm run build          # prebuild regenerates grbs.json from the committed snapshot
```

## Data (`public/data/`, all prebuilt; see `docs/sources.md`)

| Command | Does |
|---|---|
| `npm run data` | Fetch NASA's Swift GRB table, refresh `data/raw/grb_table.tsv`, rebuild `grbs.json` + `highlights.json` (validates) |
| `npm run data:offline` | Same, from the committed snapshot only |
| `npm run tle` | Fetch Swift's latest TLE from CelesTrak into `tle.json` (refuses more often than every 2 h; `--force`) |
| `node scripts/build-stars.mjs` | Rebuild `stars.json` from the Yale Bright Star Catalogue |

Hand-maintained: `predictions.json` (refresh before each deploy) and `status.json`. Flip `mode` to `"memorial"`
with `reentryTime` and `source` once Space-Track, NASA or Aerospace confirms reentry.

## Dev URL params
`?cineAt=120` freeze the tribute at 120 s (no music) · `?intro=0` / `?info=0` open straight in Explore ·
`?mode=memorial` · `?bloom=0` · `#grb=221009A` deep link.

Unofficial tribute; not affiliated with or endorsed by NASA. Music: "Travelers" by Andrew Prahlow, from
*Outer Wilds*. Permission to use it publicly is not yet confirmed.
