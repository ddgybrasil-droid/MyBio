import { DEG } from './damp';
import { LAMELLA_COUNT, LAMELLA_SPECS } from './lamellae';

/** Per lamella: position xyz, rotation xyz, scale xyz — lens space. */
export const STRIDE = 9;
/** Group: rotation xyz, scale, offset xy (lens units), bench, slab shadow, ground shadow and lab rail strength. */
export const G = { rx: 0, ry: 1, rz: 2, scale: 3, ox: 4, oy: 5, bench: 6, shadow: 7, ground: 8, rails: 9 } as const;
export const GROUP_SIZE = 10;

export interface Pose {
  lam: Float32Array;
  group: Float32Array;
}

export const createPose = (): Pose => ({
  lam: new Float32Array(LAMELLA_COUNT * STRIDE),
  group: new Float32Array(GROUP_SIZE),
});

/** Small per-slab offsets so each lamella refracts the bench by a different amount. */
const STAGGER_Z = [0.03, -0.02, 0.045, 0, -0.035, 0.02, -0.012];
const STAGGER_YAW = [4.6, -3.2, 5.4, -1.2, -4.4, 3, -5.2];
const STAGGER_PITCH = [2.4, -1.8, 1.3, -0.6, -2.2, 1.7, -1.2];
const STAGGER_ROLL = [0.5, -0.35, 0.2, 0, -0.4, 0.3, -0.55];

function set(p: Pose, i: number, px: number, py: number, pz: number, rx: number, ry: number, rz: number, sx = 1, sy = 1, sz = 1): void {
  const o = i * STRIDE;
  const l = p.lam;
  l[o] = px;
  l[o + 1] = py;
  l[o + 2] = pz;
  l[o + 3] = rx;
  l[o + 4] = ry;
  l[o + 5] = rz;
  l[o + 6] = sx;
  l[o + 7] = sy;
  l[o + 8] = sz;
}

function group(p: Pose, rx: number, ry: number, rz: number, bench: number, shadow: number, ground: number, scale = 1): void {
  const g = p.group;
  g[G.rx] = rx;
  g[G.ry] = ry;
  g[G.rz] = rz;
  g[G.scale] = scale;
  g[G.ox] = 0;
  g[G.oy] = 0;
  g[G.bench] = bench;
  g[G.shadow] = shadow;
  g[G.ground] = ground;
  g[G.rails] = 0;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Smoothstep 0→1 between edges a and b. */
function smooth(a: number, b: number, t: number): number {
  const x = clamp01((t - a) / Math.max(1e-6, b - a));
  return x * x * (3 - 2 * x);
}

/**
 * Opening optical chapter driven by scrubbed `story` 0..1 (burger-style explode / orbit / reassemble).
 *
 * - 0.00–0.18 assembled, quiet turn begins
 * - 0.18–0.48 lamellae explode like specimen layers
 * - 0.48–0.78 camera orbit + scale push while still open
 * - 0.78–1.00 reassemble toward a held calibration stance for the about handoff
 */
export function heroPose(p: Pose, story: number): void {
  const t = clamp01(story);
  const explode = smooth(0.16, 0.4, t) * (1 - smooth(0.72, 0.94, t));
  const orbit = smooth(0.34, 0.62, t);
  const settle = smooth(0.72, 1, t);
  const turn = smooth(0.04, 0.88, t);

  for (const s of LAMELLA_SPECS) {
    const i = s.index;
    const k = i - 3;
    const side = Math.sign(k) || (i % 2 ? 1 : -1);
    const fan = explode * (0.55 + Math.abs(k) * 0.22);
    const px = s.x * (1 + 0.55 * explode) + side * fan * 0.42;
    const py = s.y * (1 + 0.35 * explode) + Math.sin(i * 1.7) * 0.05 * explode;
    const pz = STAGGER_Z[i] * (1 - 0.35 * explode) - k * 0.38 * explode - orbit * 0.06 * Math.abs(k);
    const rx = (STAGGER_PITCH[i] + k * 2.4 * explode - 4 * orbit) * DEG;
    const ry = (STAGGER_YAW[i] + (28 + k * 4) * explode + 10 * orbit * side) * DEG;
    const rz = (STAGGER_ROLL[i] - k * 1.8 * explode) * DEG;
    const sx = 1 + 0.04 * explode;
    const sy = 1 + 0.08 * explode;
    const sz = 1 + 0.18 * explode;
    set(p, i, px, py, pz, rx, ry, rz, sx, sy, sz);
  }

  const yaw = (-10 + 28 * turn - 8 * settle) * DEG;
  const pitch = (3 + 7 * explode - 4 * settle + 5 * orbit) * DEG;
  const roll = (-2 + 3 * explode * Math.sin(t * Math.PI)) * DEG;
  const scale = 1 + 0.1 * explode + 0.06 * orbit - 0.04 * settle;
  group(p, pitch, yaw, roll, 1, 1, 1, scale);
  p.group[G.ox] = -0.06 * orbit + 0.04 * settle;
  p.group[G.oy] = 0.04 * explode - 0.03 * settle;
}

/** Exploded along depth and sideways, each slab turned to show its edge. */
export function aboutPose(p: Pose): void {
  for (const s of LAMELLA_SPECS) {
    const k = s.index - 3;
    set(p, s.index, s.x * 1.65, s.y * 1.5 + Math.sin(s.index * 1.7) * 0.07, -k * 0.3, k * 1.4 * DEG, (34 + k * 3.5) * DEG, -k * 1.2 * DEG);
  }
  group(p, 6 * DEG, -22 * DEG, 0, 1, 1, 0.8);
}

/**
 * Two louvre groups (4 + 3) standing at the left and right edges of the lab anchor.
 * `halfWidth`/`halfHeight` are the anchor's half extents in lens units; `bleed` pushes
 * both groups outward past the anchor edges.
 */
export function labPose(p: Pose, halfWidth: number, halfHeight: number, bleed = 0): void {
  const pitch = 0.27;
  const tall = Math.max(1.84, halfHeight * 1.72);
  for (const s of LAMELLA_SPECS) {
    const left = s.index < 4;
    const j = left ? s.index : 6 - s.index;
    const outer = Math.max(1, halfWidth) - 0.12 + bleed;
    const x = left ? -outer + j * pitch : outer - j * pitch;
    const y = (j % 2 ? -1 : 1) * 0.03 * halfHeight;
    set(p, s.index, x, y, -j * 0.06, 0, (left ? 26 : -26) * DEG + STAGGER_YAW[s.index] * DEG, 0, 1, tall / s.height, 1.35);
  }
  group(p, 0, 0, 0, 0, 0.9, 0);
  p.group[G.rails] = 1;
}

/** Shallow lens spread along the social rail, behind the pucks. */
export function contactPose(p: Pose): void {
  for (const s of LAMELLA_SPECS) {
    const i = s.index;
    set(p, i, s.x * 1.3, s.y * 0.82, STAGGER_Z[i] * 0.5, STAGGER_PITCH[i] * 0.6 * DEG, STAGGER_YAW[i] * 0.8 * DEG, 0, 1, 0.9, 0.75);
  }
  group(p, -6 * DEG, 8 * DEG, 0, 0.75, 1, 0.9);
  p.group[G.oy] = -0.2;
}

export function clearPose(p: Pose): void {
  p.lam.fill(0);
  p.group.fill(0);
}

export function addPose(out: Pose, src: Pose, weight: number): void {
  if (weight <= 0) return;
  for (let i = 0; i < out.lam.length; i++) out.lam[i] += src.lam[i] * weight;
  for (let i = 0; i < out.group.length; i++) out.group[i] += src.group[i] * weight;
}
