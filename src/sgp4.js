// satellite.js 7's package entry also re-exports an optional WASM/worker build that Vite can't
// bundle for the browser. We only need the pure-JS SGP4 pieces, so import those files directly.
export { twoline2satrec } from '../node_modules/satellite.js/dist/io.js';
export { propagate, gstime } from '../node_modules/satellite.js/dist/propagation.js';
export { eciToGeodetic, degreesLat, degreesLong } from '../node_modules/satellite.js/dist/transforms.js';
