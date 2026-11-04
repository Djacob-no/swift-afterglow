# Sources and fact check

Status: **verified** = checked against the source during the 2026-11-02 data pass ·
**standard** = well-established figure, citation link still to add before launch.

## Data

| What | Source | Notes |
|---|---|---|
| 2,046 bursts, positions, T90, fluence, redshift, instruments | [Swift GRB Table](https://swift.gsfc.nasa.gov/archive/grb_table/) (NASA GSFC / Swift Science Center) | Built by `scripts/build-data.mjs`; snapshot in `data/raw/grb_table.tsv`. Position = UVOT > XRT > BAT. 140809A has no position (counted, not drawn). |
| Earth | NASA Earth Observatory: [Blue Marble NG, Dec 2004](https://visibleearth.nasa.gov/images/74218), [Black Marble 2016](https://visibleearth.nasa.gov/images/144898) | |
| Stars | [Yale Bright Star Catalogue, 5th ed.](http://tdc-www.harvard.edu/catalogs/bsc5.html) (Hoffleit & Warren 1991) | V ≤ 6.5, 8,404 stars. Distribution page states no licence; cite as above. |
| Music | "Travelers", Andrew Prahlow, *Outer Wilds* ([Annapurna](https://annapurnainteractive.com/games/outer-wilds)) | **Permission to use not yet confirmed.** |

## Captions (`src/cinematic.js`)

| Caption | Status | Source / basis |
|---|---|---|
| Swift saw 2,046 of these | verified | Row count of the GRB table (read from data at runtime) |
| A gamma-ray burst: the death of a star | standard | Long GRBs = collapsing massive stars; short GRBs = neutron-star mergers (already-dead stars). Simplified on purpose. |
| Outshines an entire galaxy | standard | NASA GRB overviews |
| More energy than the Sun in its whole 10-billion-year life | standard | Sun: 3.8×10²⁶ W × 10¹⁰ yr ≈ 1.2×10⁴⁴ J; GRBs release ~10⁴⁴ J (beaming-corrected) to far more (isotropic) |
| 090423: light left 13 billion years ago | verified | z ≈ 8.1–8.2 (table; [NASA](https://www3.nasa.gov/mission_pages/swift/bursts/cosmic_record.html)) → lookback ≈ 13.0 Gyr |
| Milky Way holds hundreds of billions of stars | standard | Common estimate 100–400 billion |
| Hundreds of billions of galaxies | standard | Observable universe (current estimates; older "2 trillion" figure deliberately not used) |
| More stars than grains of sand on every beach | standard | Order-of-magnitude comparison (~10²² stars vs ~10¹⁸–10²¹ grains) |
| A burst like these goes off about once a day | standard | Detectable GRB rate ~1/day (BATSE all-sky) |
| Afterglow lingers for hours | standard | Hours to days |
| Turn and look within about two minutes | verified | Median XRT time-to-first-observation in the table: **117 s** (n=1,610); was "about a minute", corrected |
| Some explosions forge gold and platinum; much of Earth's gold may have been made this way | standard | Neutron-star merger r-process (GW170817 kilonova); phrased with "may" because the share is debated |
| Hundreds of people in the US, UK and Italy built and ran Swift; named for Neil Gehrels | standard | NASA mission with UK and Italian partners; renamed Neil Gehrels Swift Observatory in Jan 2018 |
| 221009A: brightest ever recorded, once in 10,000 years | verified | [JPL](https://www.jpl.nasa.gov/news/brightest-cosmic-explosion-ever-detected-had-other-unique-features/) ("blinded most gamma-ray instruments"); 10,000-yr rate per Burns et al. 2023 |
| For 22 years, Swift never stopped watching | verified | Launch 2004-11-20; operations ended Oct 2026 ([NASA](https://science.nasa.gov/blogs/swift/2026/10/23/nasas-swift-mission-ends-ahead-of-re-entry/)) |
| On 4 November 2026, Swift came home | date per forecasts | Reentry forecast for 4 Nov 2026 ([NASA, 2 Nov](https://science.nasa.gov/blogs/swift/2026/11/02/nasas-swift-observatory-to-re-enter-atmosphere/)); date set in `public/data/status.json`. Update if NASA's post-reentry confirmation gives a different day. |

## Highlights (`public/data/highlights.json`)
All six ids exist in the table (the build fails otherwise); every source link returned 200 on 2026-11-02
(the JPL page returns 403 to scripts but loads in a browser). 170817A was considered and dropped: it is not in Swift's table.

**221009A fluence caveat:** Swift's BAT triggered at 14:10:17 UT ([GCN 32632](https://gcn.nasa.gov/circulars/32632)),
about 53 min after Fermi GBM's 13:16:59 UT trigger ([GCN 32636](https://gcn.nasa.gov/circulars/32636)), so the table's
fluence (740) covers only the later emission. This is noted in its detail panel.

## Coordinate checks (2026-11-02)
- Polaris (BSC) parses to Dec +89.26°, Sirius to RA 101.29° / Dec −16.72°.
- Subsolar point at 11:19 UTC: 14.83°S, 6.1°E. The expected values are declination −14.9° and 6.1°E with the equation of time applied.
- Camera aimed at 60°N 10°E shows southern Norway centred: the texture orientation is correct.

## Memorial note (`index.html`, `#memorial`)
Partners named: NASA Goddard (mission lead), Penn State (Mission Operations Center), UK and Italian instrument teams
(XRT/UVOT: Leicester, MSSL; ASI/INAF), ASI's Malindi ground station. Neil Gehrels, PI, 1952–2017. Design life 2 years.
