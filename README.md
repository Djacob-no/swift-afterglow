# Swift Afterglow

A three.js tribute to NASA's Neil Gehrels Swift Observatory: every gamma-ray burst in Swift's GRB table,
replayed on the sky around a 3D Earth, and a memorial to the people who built and flew it. Swift reentered
on 4 November 2026; the live-orbit view was retired then.

Two views: **Tribute** (Play on the start card: song-synced cinematic, cues in `src/cinematic.js`) and
**Explore** (timeline, filters, burst details, memorial note).

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
| `node scripts/build-stars.mjs` | Rebuild `stars.json` from the Yale Bright Star Catalogue |

Hand-maintained: `status.json` (reentry date and NASA source shown on the memorial card and in the last caption).

## Dev URL params
`?cineAt=120` freeze the tribute at 120 s (no music) · `?intro=0` / `?info=0` open straight in Explore ·
`?bloom=0` · `#grb=221009A` deep link.

Unofficial tribute; not affiliated with or endorsed by NASA. Music: "Travelers" by Andrew Prahlow, from
*Outer Wilds*. Permission to use it publicly is not yet confirmed.
