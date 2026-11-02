// Small astronomy helpers. Equatorial frame: +z = celestial north pole, +x = vernal equinox.
// three.js is y-up, so we map eq (x, y, z) -> three (x, z, -y). This is a proper rotation,
// and it makes Earth's spin about three's +y axis line up with GMST.
import { Vector3, Matrix4 } from 'three';

export const DEG = Math.PI / 180;

export const EQ_TO_THREE = new Matrix4().set(
  1, 0, 0, 0,
  0, 0, 1, 0,
  0, -1, 0, 0,
  0, 0, 0, 1,
);

export function radecToEq(raDeg, decDeg) {
  const a = raDeg * DEG, d = decDeg * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

export function eqToThree(v, r = 1, out = new Vector3()) {
  return out.set(v[0] * r, v[2] * r, -v[1] * r);
}

export function julian(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

// Greenwich mean sidereal time, radians.
export function gmst(date) {
  const d = julian(date) - 2451545.0;
  let g = 280.46061837 + 360.98564736629 * d;
  g = ((g % 360) + 360) % 360;
  return g * DEG;
}

// Low-precision Sun direction (unit vector, equatorial frame).
export function sunDirEq(date) {
  const n = julian(date) - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;
  return [Math.cos(lambda), Math.cos(eps) * Math.sin(lambda), Math.sin(eps) * Math.sin(lambda)];
}

// Great circle through two orthogonal unit vectors a, b (equatorial).
export function greatCircle(a, b, segments = 256) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    pts.push([a[0] * c + b[0] * s, a[1] * c + b[1] * s, a[2] * c + b[2] * s]);
  }
  return pts;
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function galacticPlane() {
  const ngp = radecToEq(192.85948, 27.12825);
  const gc = radecToEq(266.40499, -28.93617);
  return greatCircle(gc, norm(cross(ngp, gc)));
}

export function eclipticPlane() {
  const eps = 23.439 * DEG;
  return greatCircle([1, 0, 0], [0, Math.cos(eps), Math.sin(eps)]);
}
