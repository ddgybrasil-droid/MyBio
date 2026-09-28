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

function group(p: Pose, rx: number, ry: number, rz: number, bench: number, shadow: number, ground: number): void {
  const g = p.group;
  g[G.rx] = rx;
  g[G.ry] = ry;
  g[G.rz] = rz;
  g[G.scale] = 1;
  g[G.ox] = 0;
  g[G.oy] = 0;
  g[G.bench] = bench;
  g[G.shadow] = shadow;
  g[G.ground] = ground;
  g[G.rails] = 0;
}

/** Assembled lens; `turn` 0..1 rotates it by up to 16° as the hero scrolls away. */
export function heroPose(p: Pose, turn: number): void {
  for (const s of LAMELLA_SPECS) {
    const i = s.index;
    set(p, i, s.x, s.y, STAGGER_Z[i], STAGGER_PITCH[i] * DEG, STAGGER_YAW[i] * DEG, STAGGER_ROLL[i] * DEG);
  }
  group(p, 3 * DEG, (-9 + 16 * turn) * DEG, -2 * DEG, 1, 1, 1);
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
