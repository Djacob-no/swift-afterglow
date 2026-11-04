import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { DEG, EQ_TO_THREE, radecToEq, eqToThree, gmst, sunDirEq, galacticPlane, eclipticPlane } from './astro.js';
import { SONG_LEN, BOAT_FLASH_AT, PULLBACK, REPLAY, END_CARD_AT, SEQUENCE_END, energyAt, buildCues } from './cinematic.js';
import { loadData } from './data.js';

const { GRBS, HIGHLIGHTS, STATUS, STARS, TIMELINE_START, SPAN_DAYS, TOTAL, DAY } = await loadData();
const MISSION = {
  launch: '2004-11-20T17:16:00Z',
  missionEnd: 'https://science.nasa.gov/blogs/swift/2026/10/23/nasas-swift-mission-ends-ahead-of-re-entry/',
  reentry: STATUS.reentryTime ?? '2026-11-04',
  reentrySource: STATUS.source ?? 'https://science.nasa.gov/blogs/swift/2026/11/02/nasas-swift-observatory-to-re-enter-atmosphere/',
};
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso) => { const d = new Date(iso.slice(0, 10) + 'T12:00:00Z'); return `${d.getUTCDate()} ${LONG_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
// every place the page states the burst count reads it from the data
document.querySelectorAll('[data-total]').forEach((el) => (el.textContent = TOTAL.toLocaleString('en-US')));

const SKY_R = 50;
const DPR = Math.min(window.devicePixelRatio, 2);
const BASE_DAYS_PER_SEC = SPAN_DAYS / 90; // 22 years in 90 s at 1x
const $ = (id) => document.getElementById(id);
// escape text for HTML attributes/content (data files contain quotes, e.g. the USSF note)
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// ---------- renderer / scene ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 500);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 1.4;
controls.maxDistance = 30;
controls.enablePan = false;
controls.rotateSpeed = 0.5;
controls.enabled = false;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.55, 0.75);
if (new URLSearchParams(location.search).get('bloom') !== '0') composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- background stars: Yale Bright Star Catalogue (V ≤ 6.5) ----------
{
  const n = STARS.length, pos = new Float32Array(n * 3), size = new Float32Array(n);
  const v = new THREE.Vector3();
  STARS.forEach(([ra, dec, vmag], i) => {
    eqToThree(radecToEq(ra, dec), SKY_R * 1.2, v).toArray(pos, i * 3);
    size[i] = THREE.MathUtils.clamp(3.4 - 0.5 * vmag, 0.7, 4.2); // brighter star → bigger point
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uDpr: { value: DPR } },
    vertexShader: `attribute float aSize; uniform float uDpr; varying float vA;
      void main(){ vA = 0.18 + aSize*0.16; gl_PointSize = aSize*uDpr; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying float vA; void main(){ float d=length(gl_PointCoord-.5)*2.; if(d>1.) discard;
      gl_FragColor = vec4(vec3(.75,.8,.95), (1.-d)*vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Points(geo, mat));
}

// ---------- reference circles ----------
function circleLine(ptsEq, color, opacity) {
  const v = new THREE.Vector3();
  const pts = ptsEq.map((p) => eqToThree(p, SKY_R * 0.995, v).clone());
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.6, gapSize: 0.5, depthWrite: false });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  scene.add(line);
  return line;
}
circleLine(galacticPlane(), 0xb48cff, 0.35);
circleLine(eclipticPlane(), 0xffd36b, 0.25);

// ---------- GRB sky ----------
// one burst (140809A) has no position in the table: it counts, but never appears in the sky
const hasPos = (g) => g.ra != null && g.dec != null;
const grbPos = GRBS.map((g) => (hasPos(g) ? eqToThree(radecToEq(g.ra, g.dec), SKY_R) : new THREE.Vector3()));
const grbUniforms = {
  uNow: { value: SPAN_DAYS }, uDaysPerSec: { value: BASE_DAYS_PER_SEC }, uDpr: { value: DPR },
  uFilter: { value: 0 }, uZOnly: { value: 0 }, uSolo: { value: -1 }, uSelected: { value: -1 }, uHover: { value: -1 }, uEnergy: { value: 0 },
  uGlobal: { value: 1 },
};
{
  const n = GRBS.length;
  const pos = new Float32Array(n * 3), aT = new Float32Array(n), aSize = new Float32Array(n),
    aTau = new Float32Array(n), aMask = new Float32Array(n), aId = new Float32Array(n);
  GRBS.forEach((g, i) => {
    grbPos[i].toArray(pos, i * 3);
    aT[i] = hasPos(g) ? (g.t - TIMELINE_START) / DAY : 1e7;
    aSize[i] = THREE.MathUtils.clamp(3.0 + 2.4 * Math.log10((g.fluence ?? 1) / 0.08), 2.5, 15);
    const t90 = g.t90 ?? 20;
    aTau[i] = 0.2 + 0.32 * Math.log10(1 + t90);
    aMask[i] = (g.t90 != null && g.t90 < 2 ? 1 : 0) + (g.z != null ? 2 : 0) + (g.t90 == null ? 4 : 0);
    aId[i] = i;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  for (const [k, a] of Object.entries({ aT, aSize, aTau, aMask, aId })) geo.setAttribute(k, new THREE.BufferAttribute(a, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: grbUniforms,
    vertexShader: /* glsl */ `
      attribute float aT, aSize, aTau, aMask, aId;
      uniform float uNow, uDaysPerSec, uDpr, uFilter, uZOnly, uSolo, uSelected, uHover, uGlobal, uEnergy;
      varying float vFlash, vVis, vSel, vEnergy;
      void main(){
        float dt = uNow - aT;
        float vis = step(0.0, dt);
        float sec = dt / max(uDaysPerSec, 1e-3);
        float flash = vis * exp(-max(sec, 0.0) / aTau); // clamp: future bursts would overflow to Inf -> NaN
        float isShort = mod(aMask, 2.0);
        float hasZ = step(1.5, mod(aMask, 4.0));
        float noT90 = step(3.5, aMask);
        float pass = 1.0;
        if (uFilter > 0.5 && uFilter < 1.5) pass *= (1.0 - isShort) * (1.0 - noT90);
        if (uFilter > 1.5) pass *= isShort;
        if (uZOnly > 0.5) pass *= hasZ;
        vis *= mix(0.07, 1.0, pass);
        if (uSolo >= 0.0) vis *= step(abs(aId - uSolo), 0.5);
        vSel = max(step(abs(aId - uSelected), 0.5), 0.6 * step(abs(aId - uHover), 0.5)) * step(0.0, dt);
        vFlash = flash * pass;
        vVis = vis * uGlobal;
        vEnergy = uEnergy;
        gl_PointSize = (aSize * (1.0 + 3.5 * vFlash + 0.45 * uEnergy) + vSel * 8.0) * uDpr * step(0.001, vis);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vFlash, vVis, vSel, vEnergy;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0;
        if (d > 1.0) discard;
        float core = exp(-d * d * 16.0);
        float halo = exp(-d * d * 3.0) * 0.35;
        vec3 ember = vec3(1.0, 0.42, 0.12);
        vec3 hot = vec3(0.8, 0.9, 1.0);
        vec3 col = mix(ember, hot, clamp(vFlash * 1.3, 0.0, 1.0));
        float a = (core + halo) * (0.5 + 0.9 * vEnergy + 3.0 * vFlash);
        float ring = smoothstep(0.75, 0.85, d) * (1.0 - smoothstep(0.9, 1.0, d));
        col = mix(col, vec3(0.5, 1.0, 0.85), vSel);
        a += vSel * (ring * 2.0 + core);
        gl_FragColor = vec4(col * a * vVis, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Points(geo, mat));
}

// ---------- Earth ----------
const earth = new THREE.Group();
scene.add(earth);
const sunUniform = { value: new THREE.Vector3(1, 0, 0) };
{
  const loader = new THREE.TextureLoader();
  const res = innerWidth * DPR > 1800 ? '4k' : '2k';
  const day = loader.load(`/textures/blue-marble-dec-${res}.jpg`); // NASA Blue Marble NG, December
  const night = loader.load(`/textures/black-marble-2016-${res}.jpg`); // NASA Black Marble 2016
  day.colorSpace = night.colorSpace = THREE.SRGBColorSpace;
  day.anisotropy = night.anisotropy = 8;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uDay: { value: day }, uNight: { value: night }, uSun: sunUniform },
    vertexShader: `varying vec2 vUv; varying vec3 vN;
      void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D uDay, uNight; uniform vec3 uSun; varying vec2 vUv; varying vec3 vN;
      void main(){
        float d = dot(normalize(vN), uSun);
        float k = smoothstep(-0.12, 0.18, d);
        vec3 day = texture2D(uDay, vUv).rgb * (0.08 + 0.95 * max(d, 0.0));
        vec3 night = texture2D(uNight, vUv).rgb * vec3(1.0, 0.75, 0.45) * 1.1 + vec3(0.002, 0.004, 0.01);
        gl_FragColor = vec4(mix(night, day, k), 1.0);
      }`,
  });
  earth.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat));
}
{
  const atm = new THREE.Mesh(
    new THREE.SphereGeometry(1.018, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: { uSun: sunUniform },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vV = normalize(cameraPosition - w.xyz);
          gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 uSun; varying vec3 vN; varying vec3 vV;
        void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.6); float s = clamp(dot(vN, uSun) * 0.6 + 0.45, 0.04, 1.0);
          gl_FragColor = vec4(vec3(0.3, 0.6, 1.0) * f * s * 1.4, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(atm);
}

// ---------- state ----------
const params = new URLSearchParams(location.search);
const state = {
  now: SPAN_DAYS, playing: false, speed: 1,
  filter: 'all', zOnly: false, selected: -1, hover: -1,
  view: 'start',
};

// ---------- HUD: highlights ----------
const hlList = $('highlights');
for (const h of HIGHLIGHTS) {
  const li = document.createElement('li');
  li.innerHTML = `<b>${h.id}</b><span>${h.title}</span>`;
  li.onclick = () => focusBurst(GRBS.findIndex((g) => g.id === h.id), true);
  hlList.appendChild(li);
}

// ---------- HUD: filters ----------
for (const b of $('filterChips').querySelectorAll('button')) {
  b.onclick = () => {
    state.filter = b.dataset.f;
    $('filterChips').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    grbUniforms.uFilter.value = { all: 0, long: 1, short: 2 }[state.filter];
  };
}
$('zToggle').onclick = () => {
  state.zOnly = !state.zOnly;
  $('zToggle').classList.toggle('on', state.zOnly);
  grbUniforms.uZOnly.value = state.zOnly ? 1 : 0;
};
// ---------- HUD: timeline ----------
const scrubber = $('scrubber'), playBtn = $('play');
{
  const ticks = $('ticks');
  for (let y = 2005; y <= 2026; y += 3) {
    const d = (Date.UTC(y, 0, 1) - TIMELINE_START) / DAY;
    const s = document.createElement('span');
    s.textContent = y; s.style.left = (d / SPAN_DAYS) * 100 + '%';
    ticks.appendChild(s);
  }
}
function setPlaying(p) {
  state.playing = p;
  playBtn.textContent = p ? '❚❚ Pause' : state.now >= SPAN_DAYS ? '▶ Replay 2004 → 2026' : '▶ Play';
  playBtn.classList.toggle('playing', p);
  playBtn.classList.remove('attn');
}
playBtn.onclick = () => {
  if (state.view !== 'explore') enterExplore();
  if (!state.playing && state.now >= SPAN_DAYS) state.now = 0;
  setPlaying(!state.playing);
};
$('speed').onchange = (e) => (state.speed = +e.target.value);
scrubber.oninput = () => {
  state.now = (scrubber.value / 10000) * SPAN_DAYS;
  setPlaying(false);
};

// ---------- memorial note ----------
$('memEnd').textContent = MISSION.reentry.slice(0, 10);
$('memReentryLink').href = MISSION.reentrySource;
$('memEndLink').href = MISSION.missionEnd;

// ---------- burst detail ----------
const detail = $('detail');
// BAT errors are given in arcmin, XRT/UVOT in arcsec; the build stores everything in arcsec
const fmtErr = (g) => (g.errArcsec == null ? '?' : g.posSrc === 'BAT' ? `${(g.errArcsec / 60).toFixed(1)}′` : `${g.errArcsec}″`);
function showDetail(i) {
  state.selected = i;
  grbUniforms.uSelected.value = i;
  $('memorial').classList.toggle('hidden', i >= 0); // the burst card takes its place
  if (i < 0) { detail.classList.add('hidden'); history.replaceState(null, '', location.pathname + location.search); return; }
  const g = GRBS[i];
  const hl = HIGHLIGHTS.find((h) => h.id === g.id);
  const fmt = (v, u = '') => (v == null ? '<span style="color:#555">n/a</span>' : v + u);
  detail.innerHTML = `<button class="close" aria-label="Close">×</button>
    <h2>GRB ${g.id}</h2>
    <div class="sub">${g.timeKnown ? g.iso.replace('T', ' ').replace('Z', ' UTC') : g.iso.slice(0, 10) + ' (time not listed)'}</div>
    ${hl ? `<div class="hl">★ ${hl.title}: ${hl.blurb}${hl.note ? `<br><span class="hl-note">${hl.note}</span>` : ''} <a href="${hl.url}" target="_blank" rel="noopener">source ↗</a></div>` : ''}
    <dl>
      <dt>RA / Dec</dt><dd>${hasPos(g) ? `${g.ra.toFixed(3)}°, ${g.dec >= 0 ? '+' : ''}${g.dec.toFixed(3)}°` : fmt(null)}</dd>
      <dt>Position</dt><dd>${g.posSrc ? `${g.posSrc} ± ${fmtErr(g)}` : fmt(null)}</dd>
      <dt>T90</dt><dd>${g.t90 == null ? fmt(null) : `${g.t90Q ?? ''}${g.t90} s · ${g.t90 < 2 && g.t90Q !== '>' ? 'short' : 'long'}`}</dd>
      <dt>Fluence</dt><dd>${g.fluence == null ? fmt(null) : `${g.fluenceQ ?? ''}${g.fluence}`} <small>×10⁻⁷ erg/cm² (BAT)</small></dd>
      <dt>Peak flux</dt><dd>${fmt(g.peakFlux)} <small>ph/cm²/s</small></dd>
      <dt>Redshift</dt><dd>${g.z == null ? fmt(null) : `z = ${g.z}${g.zType === 'phot' ? ' <small>(photometric)</small>' : ''}`}</dd>
      ${g.xrtDelay != null && g.xrtDelay < 3600 ? `<dt>X-ray look</dt><dd>${Math.round(g.xrtDelay)} s after trigger</dd>` : ''}
      <dt>Instruments</dt><dd>${['BAT', 'XRT', 'UVOT'].map((k) => {
        const st = g[k.toLowerCase()];
        const tip = st === 'det' ? 'detected' : st === 'obs' ? 'looked, nothing detected (upper limit)' : 'no data';
        return `<span class="inst ${st === 'det' ? 'y' : st === 'obs' ? 'o' : ''}" title="${k}: ${tip}">${k}${st === 'obs' ? ' ○' : ''}</span>`;
      }).join('')}</dd>
      <dt>GCN</dt><dd>${g.gcn.length ? g.gcn.slice(0, 6).map((n) => `<a href="https://gcn.nasa.gov/circulars/${n}" target="_blank" rel="noopener">${n}</a>`).join(' ')
        + (g.gcn.length > 6 ? ` <a href="https://gcn.nasa.gov/circulars/events/grb-${g.id.toLowerCase()}" target="_blank" rel="noopener">+${g.gcn.length - 6} more ↗</a>` : '') : fmt(null)}</dd>
    </dl>`;
  detail.querySelector('.close').onclick = () => showDetail(-1);
  detail.classList.remove('hidden');
  history.replaceState(null, '', `#grb=${g.id}`);
}

// camera slew: put the burst beside Earth, not behind it
let slew = null;
function focusBurst(i, jumpTime) {
  if (i < 0) return;
  if (state.view !== 'explore') enterExplore();
  const dir = grbPos[i].clone().normalize();
  const side = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
  if (side.lengthSq() < 0.01) side.set(1, 0, 0);
  const to = dir.clone().negate().addScaledVector(side, 0.55).addScaledVector(new THREE.Vector3(0, 1, 0), 0.15).normalize().multiplyScalar(6);
  slew = { from: camera.position.clone(), to, t: 0 };
  if (jumpTime) {
    state.now = (GRBS[i].t - TIMELINE_START) / DAY - BASE_DAYS_PER_SEC * state.speed * 0.15;
    setPlaying(false);
    // let it flash: advance briefly
    flashUntil = state.now + BASE_DAYS_PER_SEC * state.speed * 0.3;
  }
  showDetail(i);
}
let flashUntil = -1;

// ---------- picking ----------
const tip = $('tooltip');
const tmp = new THREE.Vector3();
function rayHitsEarth(from, to) {
  const d = tmp.subVectors(to, from); const len = d.length(); d.divideScalar(len);
  const b = from.dot(d), c = from.lengthSq() - 1;
  const disc = b * b - c;
  if (disc < 0) return false;
  const t = -b - Math.sqrt(disc);
  return t > 0 && t < len;
}
const proj = new THREE.Vector3();
function pick(cx, cy) {
  let best = -1, bestD = 14 * 14;
  for (let i = 0; i < GRBS.length; i++) {
    if (!hasPos(GRBS[i])) continue;
    const aT = (GRBS[i].t - TIMELINE_START) / DAY;
    if (aT > state.now) continue;
    const g = GRBS[i];
    if (state.filter === 'long' && !(g.t90 != null && g.t90 >= 2)) continue;
    if (state.filter === 'short' && !(g.t90 != null && g.t90 < 2)) continue;
    if (state.zOnly && g.z == null) continue;
    proj.copy(grbPos[i]).project(camera);
    if (proj.z > 1) continue;
    const sx = (proj.x * 0.5 + 0.5) * innerWidth, sy = (-proj.y * 0.5 + 0.5) * innerHeight;
    const d = (sx - cx) ** 2 + (sy - cy) ** 2;
    if (d < bestD && !rayHitsEarth(camera.position, grbPos[i])) { bestD = d; best = i; }
  }
  return best;
}
let downAt = null;
canvas.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
canvas.addEventListener('pointerup', (e) => {
  if (state.view !== 'explore') return;
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const i = pick(e.clientX, e.clientY);
  showDetail(i === state.selected ? -1 : i);
});
canvas.addEventListener('pointermove', (e) => {
  if (state.view !== 'explore' || e.buttons) return;
  const i = pick(e.clientX, e.clientY);
  state.hover = i; grbUniforms.uHover.value = i;
  canvas.style.cursor = i >= 0 ? 'pointer' : '';
  if (i >= 0) {
    tip.classList.remove('hidden');
    tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px';
    tip.textContent = `GRB ${GRBS[i].id}`;
  } else tip.classList.add('hidden');
});

// ---------- views: start / tribute / explore ----------
const boatIdx = GRBS.findIndex((g) => g.id === '221009A');
const boatT = (GRBS[boatIdx].t - TIMELINE_START) / DAY;
const boatDir = grbPos[boatIdx].clone().normalize();
const introFrom = boatDir.clone().multiplyScalar(SKY_R - 9);
const introLook = boatDir.clone().multiplyScalar(SKY_R);
const ORIGIN = new THREE.Vector3();
function earthView(dist) {
  // a camera spot just off the day side, so the pullback lands on a lit Earth with the terminator in view
  const sun = eqToThree(sunDirEq(new Date()), 1, new THREE.Vector3());
  const side = new THREE.Vector3(0, 1, 0).cross(sun).normalize();
  if (side.lengthSq() < 0.01) side.set(1, 0, 0);
  return sun.addScaledVector(side, 0.8).add(new THREE.Vector3(0, 0.45, 0)).normalize().multiplyScalar(dist);
}
let introTo = earthView(6.5);
const currentLook = introLook.clone();
const REPLAY_DPS = SPAN_DAYS / (REPLAY[1] - REPLAY[0]);
const replayTimeOf = (days) => REPLAY[0] + (days / SPAN_DAYS) * (REPLAY[1] - REPLAY[0]);
const burstAt = (id) => replayTimeOf((GRBS.find((g) => g.id === id).t - TIMELINE_START) / DAY);
const cues = buildCues({ total: TOTAL, burstAt, memorial: true, reentryDate: longDate(MISSION.reentry) });
const cineAt = params.has('cineAt') ? +params.get('cineAt') : null; // debug: freeze the tribute at t seconds
const cine = { t: 0, done: false, orbiting: false, userZoomed: false, cue: null };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function setView(v) {
  state.view = v;
  document.body.classList.remove('v-start', 'v-tribute', 'v-explore');
  document.body.classList.add('v-' + v);
  // hidden views must not take clicks or keyboard focus
  for (const id of ['cineUi', 'endCard']) $(id).inert = v !== 'tribute';
  for (const id of ['title', 'left', 'memorial', 'timeline', 'credits', 'detail']) $(id).inert = v !== 'explore';
}
setView('start');
camera.position.copy(introFrom);
camera.lookAt(introLook);
grbUniforms.uSolo.value = boatIdx;
grbUniforms.uNow.value = -1;

function enterTribute({ withMusic = true } = {}) {
  setView('tribute');
  Object.assign(cine, { t: 0, done: false, orbiting: false, userZoomed: false });
  Object.assign(label, { idx: -1, since: 0, hiddenAt: -99 });
  showCue(null);
  $('endCard').classList.remove('on', 'done');
  showDetail(-1);
  setPlaying(false);
  slew = null;
  introTo = earthView(6.5);
  camera.position.copy(introFrom);
  currentLook.copy(introLook);
  camera.lookAt(introLook);
  controls.enabled = false;
  controls.autoRotate = false;
  grbUniforms.uSolo.value = boatIdx;
  grbUniforms.uNow.value = -1;
  if (withMusic && musicOn) { music.currentTime = 0; setMusic(true); }
}

function enterExplore() {
  const fromTribute = state.view === 'tribute' || state.view === 'start';
  setView('explore');
  showCue(null);
  controls.autoRotate = false;
  grbUniforms.uSolo.value = -1;
  grbUniforms.uEnergy.value = 0;
  bloom.strength = 0.85;
  if (fromTribute && cine.t < REPLAY[0]) state.now = SPAN_DAYS; // left before the replay began: show the full sky
  setPlaying(false);
  // still out in the sky (intro or start screen)? fly back to Earth
  if (camera.position.length() > 12) slew = { from: camera.position.clone(), to: earthView(6.5), t: 0, lookFrom: currentLook.clone() };
  else { controls.enabled = true; controls.target.set(0, 0, 0); }
}

// caption crossfade: fade the old line out, then bring the new one in
const capEl = $('caption'), calloutEl = $('callout');
let capTimer = 0;
function showCue(cue) {
  if (cine.cue === cue) return;
  cine.cue = cue;
  clearTimeout(capTimer);
  capEl.classList.remove('on');
  if (!cue) return;
  capTimer = setTimeout(() => {
    capEl.innerHTML = cue.text;
    capEl.classList.add('on');
  }, capEl.textContent ? 550 : 0);
}

// ---------- flash label: one name tag at a time on a burst that just went off in view ----------
const LABEL_HOLD = 7; // seconds a label stays up
const LABEL_GAP = 1.2; // pause between labels, so they never jump around
const LABEL_LOOKBACK = 1.2; // only bursts that flashed within the last ~1 s of playback
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const labelDate = (t) => { const d = new Date(t); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const label = { idx: -1, since: 0, hiddenAt: -99 };
function labelSpot(i) {
  proj.copy(grbPos[i]).project(camera);
  const x = (proj.x * 0.5 + 0.5) * innerWidth, y = (-proj.y * 0.5 + 0.5) * innerHeight;
  // keep clear of the edges, the corner buttons and the caption area; skip anything behind Earth
  const ok = proj.z < 1 && x > 50 && x < innerWidth - 190 && y > 70 && y < innerHeight * 0.66 && !rayHitsEarth(camera.position, grbPos[i]);
  return ok ? [x, y] : null;
}
function hideLabel(T) {
  if (label.idx >= 0) { label.idx = -1; label.hiddenAt = T; }
  calloutEl.classList.remove('on');
}
function updateFlashLabel(T) {
  if (cine.done || T < REPLAY[0] + 1) return hideLabel(T);
  // a burst named in the current caption wins, if it's in view
  const cueIdx = cine.cue?.burst ? GRBS.findIndex((g) => g.id === cine.cue.burst) : -1;
  const cueVisible = cueIdx >= 0 && grbDays[cueIdx] <= state.now && labelSpot(cueIdx);
  if (label.idx >= 0) {
    const spot = labelSpot(label.idx);
    const expired = T - label.since >= LABEL_HOLD && label.idx !== cueIdx;
    if (!spot || expired || (cueVisible && label.idx !== cueIdx)) return hideLabel(T);
    calloutEl.style.left = spot[0] + 'px';
    calloutEl.style.top = spot[1] + 'px';
    return;
  }
  if (T - label.hiddenAt < LABEL_GAP) return;
  let pickIdx = cueVisible ? cueIdx : -1;
  for (let i = countAt(state.now) - 1; pickIdx < 0 && i >= 0 && grbDays[i] >= state.now - LABEL_LOOKBACK * REPLAY_DPS; i--) {
    if (hasPos(GRBS[i]) && labelSpot(i)) pickIdx = i;
  }
  if (pickIdx < 0) return;
  const g = GRBS[pickIdx];
  label.idx = pickIdx; label.since = T;
  calloutEl.querySelector('b').textContent = `GRB ${g.id}`;
  calloutEl.querySelector('small').textContent = labelDate(g.t);
  const spot = labelSpot(pickIdx);
  calloutEl.style.left = spot[0] + 'px';
  calloutEl.style.top = spot[1] + 'px';
  calloutEl.classList.add('on');
}

canvas.addEventListener('wheel', () => { if (cine.orbiting) cine.userZoomed = true; }, { passive: true });
canvas.addEventListener('touchstart', (e) => { if (cine.orbiting && e.touches.length > 1) cine.userZoomed = true; }, { passive: true });

function runTribute(dt) {
  if (!cine.done) {
    // the song is the master clock while it plays; otherwise run on our own
    const songT = music.currentTime;
    if (cineAt != null) cine.t = cineAt;
    else if (musicOn && !music.paused && songT > 0.05) cine.t = songT; // stays locked even after buffering or a background tab
    else cine.t += dt;
  }
  const T = cine.t;

  // 1. the BOAT flashes alone, then 2. pull back to Earth while the replay starts
  if (T < REPLAY[0]) {
    grbUniforms.uSolo.value = boatIdx;
    grbUniforms.uDaysPerSec.value = 1;
    grbUniforms.uNow.value = T < BOAT_FLASH_AT ? -1 : boatT + (T - BOAT_FLASH_AT) * 0.5;
    state.now = 0;
  } else {
    grbUniforms.uSolo.value = -1;
    state.now = THREE.MathUtils.clamp((T - REPLAY[0]) * REPLAY_DPS, 0, SPAN_DAYS);
    grbUniforms.uNow.value = state.now;
    grbUniforms.uDaysPerSec.value = REPLAY_DPS;
  }
  if (T < PULLBACK[1]) {
    const k = ease(smooth(PULLBACK[0], PULLBACK[1], T));
    camera.position.lerpVectors(introFrom, introTo, k);
    currentLook.lerpVectors(introLook, ORIGIN, Math.min(k * 1.3, 1));
    camera.lookAt(currentLook);
    controls.enabled = false;
  } else if (!cine.orbiting) {
    cine.orbiting = true;
    currentLook.set(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.enabled = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
  }
  // slow dolly out over the replay, unless the viewer has zoomed themselves
  if (cine.orbiting && !cine.userZoomed) camera.position.setLength(THREE.MathUtils.lerp(6.5, 9, smooth(PULLBACK[1], REPLAY[1], T)));

  // the sky breathes with the music
  const e = cine.done ? energyAt(music.currentTime) * 0.5 : energyAt(T);
  grbUniforms.uEnergy.value = e;
  bloom.strength = 0.85 + 0.7 * e;

  // captions
  showCue(cine.done ? null : cues.find((c) => T >= c.at && T < c.at + c.dur) ?? null);
  updateFlashLabel(T);

  // readout + ending
  if (T >= REPLAY[0] && !cine.done) {
    $('cineReadout').textContent = `${new Date(TIMELINE_START + state.now * DAY).getUTCFullYear()} · ${countAt(state.now).toLocaleString()} BURSTS`;
  } else if (T < REPLAY[0]) $('cineReadout').textContent = '';
  $('endCard').classList.toggle('on', T >= END_CARD_AT);
  // music credit: full card during the opening and the ending, a quiet one-liner in between
  // hidden until the camera has pulled back to Earth (text gets the focus first),
  // then the full card for a while, a quiet one-liner mid-tribute, and full again on the end card
  $('nowPlaying').classList.toggle('np-hidden', T < PULLBACK[1] + 0.5);
  $('nowPlaying').classList.toggle('mini', T > PULLBACK[1] + 12 && T < END_CARD_AT);
  if (T >= SEQUENCE_END && !cine.done) {
    cine.done = true;
    $('endCard').classList.add('done');
    $('cineReadout').textContent = '';
  }
}

// ---------- start screen, help, music ----------
const music = new Audio('/audio/Travelers.mp3');
music.loop = true;
// don't let the 3 MB song compete with the scene's first load; start buffering once the page has settled
music.preload = 'none';
const bufferMusic = () => setTimeout(() => {
  // load() resets the element, so never call it once playback has been requested (Play pressed early)
  if (music.preload === 'auto' || !music.paused || music.played.length || state.view === 'tribute') return;
  music.preload = 'auto';
  music.load();
}, 1500);
if (document.readyState === 'complete') bufferMusic(); else addEventListener('load', bufferMusic, { once: true });
const MUSIC_VOL = 0.6;
let musicOn = localStorage.getItem('sa-music') !== 'off';
let fadeId = 0;
function fadeMusic(to, ms = 1500) {
  const id = ++fadeId; // a newer fade cancels this one (e.g. unmute during a fade-out)
  const from = music.volume, t0 = performance.now();
  const step = () => {
    if (id !== fadeId) return;
    const k = Math.min((performance.now() - t0) / ms, 1);
    music.volume = from + (to - from) * k;
    if (k < 1) requestAnimationFrame(step); else if (to === 0) music.pause();
  };
  requestAnimationFrame(step);
}
function setMusic(on) {
  musicOn = on;
  localStorage.setItem('sa-music', on ? 'on' : 'off');
  $('muteToggle').textContent = on ? '♪ Music on' : '♪ Music off';
  syncNpMute();
  if (on) {
    // rejoin the song where the tribute is, so captions stay in sync
    if (state.view === 'tribute' && !cine.done && music.paused) music.currentTime = cine.t;
    music.volume = 0; music.play().catch(() => {}); fadeMusic(MUSIC_VOL);
  } else fadeMusic(0, 400);
}
const closeTimers = {};
function closeDialog(id) {
  $(id).classList.add('closing');
  clearTimeout(closeTimers[id]);
  closeTimers[id] = setTimeout(() => $(id).classList.add('hidden'), 700);
}
function openDialog(id) {
  clearTimeout(closeTimers[id]);
  $(id).classList.remove('hidden', 'closing');
}
$('aboutPlay').onclick = () => { closeDialog('about'); enterTribute(); };
$('skipToData').onclick = () => { closeDialog('about'); enterExplore(); };
$('aboutOpen').onclick = () => openDialog('help');
$('helpClose').onclick = () => closeDialog('help');
$('muteToggle').onclick = $('npMute').onclick = () => setMusic(!musicOn);
function syncNpMute() {
  $('npMute').classList.toggle('off', !musicOn);
  const label = musicOn ? 'Mute music' : 'Unmute music';
  $('npMute').setAttribute('aria-label', label);
  $('npMute').title = label;
}
syncNpMute();
$('muteToggle').textContent = musicOn ? '♪ Music on' : '♪ Music off';
$('toExplore').onclick = $('endExplore').onclick = () => enterExplore();
$('watchAgain').onclick = $('watchTribute').onclick = () => enterTribute();

addEventListener('keydown', (e) => {
  if (!$('help').classList.contains('hidden')) { if (e.code === 'Escape') closeDialog('help'); return; }
  if (state.view === 'tribute' && e.code === 'Escape') enterExplore();
  else if (state.view === 'explore' && e.code === 'Space') { e.preventDefault(); playBtn.click(); }
});

// ---------- debug / deep links ----------
const hashId = (location.hash.match(/grb=([\w]+)/) || [])[1];
const hashIdx = hashId ? GRBS.findIndex((g) => g.id === hashId) : -1;
if (hashIdx >= 0 || params.get('intro') === '0' || params.get('info') === '0') {
  $('about').classList.add('hidden');
  camera.position.copy(introTo); currentLook.set(0, 0, 0); camera.lookAt(0, 0, 0);
  enterExplore();
  if (params.has('now')) state.now = +params.get('now') * SPAN_DAYS;
  if (hashIdx >= 0) focusBurst(hashIdx, false);
} else if (cineAt != null) {
  $('about').classList.add('hidden');
  enterTribute({ withMusic: false });
}

// ---------- loop ----------
const clock = new THREE.Clock();
const yearEl = $('year'), countEl = $('count');
const grbDays = GRBS.map((g) => (g.t - TIMELINE_START) / DAY);
function countAt(now) {
  let lo = 0, hi = grbDays.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (grbDays[m] <= now) lo = m + 1; else hi = m; }
  return lo;
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1); // capped so a long pause doesn't make things jump

  // Earth turns and is lit as it is right now
  const od = new Date();
  earth.rotation.y = gmst(od);
  eqToThree(sunDirEq(od), 1, sunUniform.value);

  if (state.view === 'tribute') runTribute(dt);
  else if (state.view === 'explore') {
    if (state.playing) {
      state.now += dt * BASE_DAYS_PER_SEC * state.speed;
      if (state.now >= SPAN_DAYS) { state.now = SPAN_DAYS; setPlaying(false); }
    } else if (flashUntil > 0) {
      state.now += dt * BASE_DAYS_PER_SEC * state.speed * 0.6;
      if (state.now >= flashUntil) flashUntil = -1;
    }
    grbUniforms.uNow.value = state.now;
    grbUniforms.uDaysPerSec.value = BASE_DAYS_PER_SEC * state.speed;
    scrubber.value = Math.round((state.now / SPAN_DAYS) * 10000);
    const date = new Date(TIMELINE_START + state.now * DAY);
    yearEl.textContent = date.getUTCFullYear();
    countEl.textContent = `${countAt(state.now).toLocaleString()} / ${TOTAL.toLocaleString()} bursts`;
  }

  if (slew) {
    slew.t = Math.min(slew.t + dt / 1.6, 1);
    const k = ease(slew.t);
    // slerp-ish: lerp then rescale to keep a nice orbit around Earth
    const r = THREE.MathUtils.lerp(slew.from.length(), slew.to.length(), k);
    camera.position.lerpVectors(slew.from, slew.to, k).setLength(Math.max(r, 2));
    if (slew.lookFrom) { currentLook.lerpVectors(slew.lookFrom, new THREE.Vector3(), k); camera.lookAt(currentLook); }
    else camera.lookAt(0, 0, 0);
    if (slew.t >= 1) { slew = null; controls.enabled = true; controls.target.set(0, 0, 0); }
    else controls.enabled = false;
  }
  if (controls.enabled) controls.update(dt); // dt makes auto-rotate frame-rate independent

  composer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

if (import.meta.env.DEV || params.has('debug')) window.__sa = { camera, grbUniforms, grbPos, boatIdx, state, GRBS, music, cine, controls, label, gmst, sunDirEq, eqToThree, radecToEq, earth };
