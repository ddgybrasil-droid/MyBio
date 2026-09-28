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
 * Opening chapter: optical focus-stack / barrel peel — not a cartoon explode-fly.
 *
 * Like separating thin glass elements on a precision mount along the optical axis:
 * - 0.00–0.22 quiet assembled optic, slow intentional yaw
 * - 0.18–0.58 depth peel: lamellae space primarily in Z with micro lateral stagger
 * - 0.42–0.78 soft gimbal tilt (pitch/yaw) while peeled — studio examination, not orbit fly
 * - 0.72–1.00 settle toward the about handoff stance
 */
export function heroPose(p: Pose, story: number): void {
  const t = clamp01(story);
  const peel = smooth(0.18, 0.46, t) * (1 - smooth(0.72, 0.96, t));
  const gimbal = smooth(0.38, 0.68, t) * (1 - smooth(0.78, 0.98, t));
  const settle = smooth(0.72, 1, t);
  const turn = smooth(0.02, 0.9, t);

  for (const s of LAMELLA_SPECS) {
    const i = s.index;
    const k = i - 3;
    // Optical-axis spacing first; lateral is a whisper so edges catch light, not fly apart.
    const pz = STAGGER_Z[i] * (1 + 0.35 * peel) - k * 0.22 * peel - k * 0.04 * gimbal;
    const px = s.x * (1 + 0.08 * peel) + k * 0.018 * peel;
    const py = s.y * (1 + 0.05 * peel) + Math.sin(i * 1.1) * 0.012 * peel;
    const rx = (STAGGER_PITCH[i] * (1 - 0.35 * peel) + k * 1.1 * peel - 2.2 * gimbal) * DEG;
    const ry = (STAGGER_YAW[i] * (1 - 0.25 * peel) + k * 2.4 * peel + 3.5 * gimbal * Math.sign(k || 1)) * DEG;
    const rz = (STAGGER_ROLL[i] * (1 - 0.4 * peel) - k * 0.55 * peel) * DEG;
    const sx = 1 + 0.012 * peel;
    const sy = 1 + 0.02 * peel;
    const sz = 1 + 0.06 * peel;
    set(p, i, px, py, pz, rx, ry, rz, sx, sy, sz);
  }

  const yaw = (-8 + 16 * turn - 6 * settle + 4 * gimbal) * DEG;
  const pitch = (2.5 + 3.5 * peel + 4 * gimbal - 3.5 * settle) * DEG;
  const roll = (-1.2 + 1.4 * peel * Math.sin(t * Math.PI) - 0.8 * settle) * DEG;
  const scale = 1 + 0.035 * peel + 0.02 * gimbal - 0.025 * settle;
  group(p, pitch, yaw, roll, 1, 1, 1, scale);
  p.group[G.ox] = -0.025 * gimbal + 0.03 * settle;
  p.group[G.oy] = 0.018 * peel - 0.022 * settle;
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
  group(p, -6 * DEG, 8 * DEG, 0, 0.55, 0.85, 0.75);
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
