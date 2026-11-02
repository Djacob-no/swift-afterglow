// Tribute sequence: timings are in song seconds (Travelers, 210 s). The tribute itself ends at ~2:10
// (end card), while the song plays on and loops. The sky's glow follows the song's loudness envelope.

export const SONG_LEN = 210;
export const BOAT_FLASH_AT = 1.0;
export const PULLBACK = [6.5, 11.5];
export const REPLAY = [10, 122]; // the whole 2004→2026 timeline plays inside this window (song keeps looping after)
export const END_CARD_AT = 123;
export const SEQUENCE_END = 130;

// 2-second RMS bins of Travelers.mp3 (measured by decoding the file in the browser).
const RMS = [43, 47, 47, 44, 48, 58, 47, 50, 52, 54, 66, 63, 55, 57, 45, 49, 58, 49, 48, 55, 60, 71, 66, 63, 68, 64, 72, 57, 59,
  79, 65, 102, 103, 92, 101, 97, 89, 103, 111, 154, 177, 245, 205, 201, 225, 214, 208, 221, 227, 224, 257, 263, 219, 207, 240,
  246, 248, 224, 236, 237, 239, 236, 253, 235, 222, 201, 185, 173, 171, 164, 149, 145, 171, 137, 129, 131, 130, 125, 133, 134,
  133, 122, 124, 118, 113, 116, 128, 118, 115, 112, 98, 88, 87, 94, 77, 64, 63, 54, 51, 54, 49, 44, 45, 44, 31, 0];

/** Song loudness at t seconds, normalised to 0..1. */
export function energyAt(t) {
  const x = Math.max(0, t / 2 - 0.5);
  const i = Math.min(Math.floor(x), RMS.length - 2), f = Math.min(x - i, 1);
  const v = RMS[i] * (1 - f) + RMS[i + 1] * f;
  return Math.min(Math.max((v - 50) / 210, 0), 1);
}

const STEP = 7.5; // a new line every ~7.5 s: ~6.8 s on screen, ~1 s crossfade

/**
 * Caption cues, back to back so there is almost always text on screen.
 * `burstAt(id)` returns the song time at which that burst appears in the replay,
 * so burst-tied captions stay correct when real data replaces the mock.
 */
export function buildCues({ total, burstAt, memorial, reentryDate }) {
  const cues = [
    { at: 2.5, text: `Swift saw <b>${total.toLocaleString('en-US')}</b> of these.` },
    { at: 9.5, text: 'Each one is a gamma-ray burst:<br>the death of a star.' },
    { at: 17, text: 'For a few seconds, it outshines<br>an entire galaxy.' },
    { at: 24.5, text: 'In those seconds it releases more energy<br>than our Sun will in its whole 10-billion-year life.' },
    { at: burstAt('090423') - 1, burst: '090423', text: 'This light left its star 13 billion years ago,<br>long before Earth existed.' },
    { at: 39, text: 'Our Milky Way alone holds<br>hundreds of billions of stars.' },
    { at: 46.5, text: 'And there are hundreds of billions of galaxies.' },
    { at: 54, text: 'More stars than grains of sand<br>on every beach on Earth.' },
    { at: 61.5, text: 'Somewhere out there, a burst like these<br>goes off about once a day.' },
    { at: 69, text: 'After the flash, a fading glow lingers for hours.<br>It is called the <b>afterglow</b>.' },
    { at: 76.5, text: 'Catching it was Swift\'s job.<br>It could turn and look within about two minutes.' },
    { at: 84, text: 'Some of these explosions forge gold and platinum.<br>Much of the gold on Earth may have been made this way.' },
    { at: 91.5, text: 'Hundreds of people in the US, UK and Italy built and ran Swift.<br>It carries the name of its leader, Neil Gehrels.' },
    { at: burstAt('221009A') - 1, burst: '221009A', text: 'October 2022: the brightest burst ever recorded.<br>Maybe a once-in-10,000-years event.' },
    { at: 107, text: 'For 22 years, Swift never stopped watching.' },
    { at: 114.5, text: !memorial ? 'This week, it falls home.' : reentryDate ? `On ${reentryDate}, it came home.` : 'And then, Swift came home.' },
  ].sort((x, y) => x.at - y.at);
  // each line stays until just before the next (capped), the last one until the end card
  cues.forEach((c, i) => {
    const next = cues[i + 1]?.at ?? END_CARD_AT;
    c.dur = Math.min(next - c.at - 0.6, i === cues.length - 1 ? 99 : STEP - 0.7);
  });
  return cues;
}
