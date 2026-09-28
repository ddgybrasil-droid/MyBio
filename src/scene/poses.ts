import { DEG } from './damp';
import { LAMELLA_COUNT, LAMELLA_SPECS } from './lamellae';

/** Per lamella: position xyz, rotation xyz, scale xyz — lens space. */
export const STRIDE = 9;
/** Group: rotation xyz, scale, offset xy (lens units), bench strength, shadow strength. */
export const G = { rx: 0, ry: 1, rz: 2, scale: 3, ox: 4, oy: 5, bench: 6, shadow: 7 } as const;
export const GROUP_SIZE = 8;

export interface Pose {
  lam: Float32Array;
  group: Float32Array;
}

export const createPose = (): Pose => ({
  lam: new Float32Array(LAMELLA_COUNT * STRIDE),
  group: new Float32Array(GROUP_SIZE),
});

const STAGGER_Z = [0.03, -0.02, 0.045, 0, -0.035, 0.02, -0.012];
const STAGGER_YAW = [2.6, -1.6, 3.1, 0, -2.2, 1.5, -2.9];
const STAGGER_PITCH = [1.8, -1.2, 0.8, 0, -1.5, 1.1, -0.7];

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

function group(p: Pose, rx: number, ry: number, rz: number, bench: number, shadow: number): void {
  const g = p.group;
  g[G.rx] = rx;
  g[G.ry] = ry;
  g[G.rz] = rz;
  g[G.scale] = 1;
  g[G.ox] = 0;
  g[G.oy] = 0;
  g[G.bench] = bench;
  g[G.shadow] = shadow;
}

/** Assembled lens; `turn` 0..1 rotates it by up to 16° as the hero scrolls away. */
export function heroPose(p: Pose, turn: number): void {
  for (const s of LAMELLA_SPECS) {
    set(p, s.index, s.x, s.y, STAGGER_Z[s.index], STAGGER_PITCH[s.index] * DEG, STAGGER_YAW[s.index] * DEG, 0);
  }
  group(p, 3 * DEG, (-11 + 16 * turn) * DEG, -2 * DEG, 1, 1);
}

/** Exploded along depth and sideways, each slab turned to show its edge. */
export function aboutPose(p: Pose): void {
  for (const s of LAMELLA_SPECS) {
    const k = s.index - 3;
    set(p, s.index, s.x * 1.9, s.y * 1.6 + Math.sin(s.index * 1.7) * 0.07, -k * 0.34, k * 1.4 * DEG, (50 + k * 3.5) * DEG, -k * 1.2 * DEG);
  }
  group(p, 7 * DEG, -26 * DEG, 0, 0.7, 1);
}

/** Two shutter groups pushed to the left and right edges of the lab anchor. */
export function labPose(p: Pose, halfWidth: number): void {
  const edge = Math.max(1.1, halfWidth - 0.2);
  for (const s of LAMELLA_SPECS) {
    const left = s.index < 4;
    const j = left ? s.index : 6 - s.index;
    const x = left ? -edge + j * 0.2 : edge - j * 0.2;
    const sy = 1.84 / s.height;
    set(p, s.index, x, 0, -j * 0.05, 0, (left ? 13 : -13) * DEG, 0, 1, sy, 1);
  }
  group(p, 0, 0, 0, 0, 0.75);
}

/** Shallow reassembled lens that the social pucks sit in front of. */
export function contactPose(p: Pose): void {
  for (const s of LAMELLA_SPECS) {
    set(p, s.index, s.x * 1.07, s.y * 0.8, STAGGER_Z[s.index] * 0.5, 0, STAGGER_YAW[s.index] * 0.5 * DEG, 0, 1, 1, 0.6);
  }
  group(p, -14 * DEG, 9 * DEG, 0, 0.45, 1);
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
