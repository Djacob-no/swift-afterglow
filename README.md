# Swift Afterglow (prototype)

Visual prototype of the plan in `plan.txt`. **All data is mock** (`src/mockData.js`). Music: `public/audio/Travelers.mp3` (loops, starts on the explainer's Play button), shaped like the planned
`grbs.json` / `predictions.json` / `tle.json` / `status.json`.

```
npm install
npm run dev        # http://localhost:5173
```

Two views: **Tribute** (Play on the start card: song-synced cinematic, cues in `src/cinematic.js`) and **Explore** (technical HUD).

Dev URL params: `?cineAt=120` freeze the tribute at 120 s (no music) · `?intro=0` / `?info=0` open straight in Explore · `?mode=memorial` · `?bloom=0` · `#grb=221009A` deep link.
