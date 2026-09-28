import { BufferGeometry, Float32BufferAttribute, Shape, Vector2, Vector3 } from 'three';

export const LAMELLA_COUNT = 7;

export type Quality = 'high' | 'low';

export interface LamellaSpec {
  index: number;
  /** Centre of the slab in lens space (lens radius = 1). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Core thickness before the convex bulge. */
  depth: number;
  notch: { y: number; height: number; depth: number } | null;
}

const PITCH = 0.286;
const GAP = 0.036;
const BULGE = 0.145;
const EDGE_RADIUS = 0.03;
const HEIGHT_TWEAK = [1.03, 0.96, 1.02, 1, 0.95, 1.04, 0.98];
const Y_OFFSET = [0.035, -0.045, 0.02, 0, -0.03, 0.05, -0.015];
const DEPTH_TWEAK = [1.1, 0.9, 1, 1.12, 0.94, 1.06, 0.88];

/**
 * Seven vertical slabs whose heights follow a circular chord, so side by side they
 * read as one round optic. Each is slightly different; lamella 4 carries a notch.
 */
export const LAMELLA_SPECS: readonly LamellaSpec[] = Array.from({ length: LAMELLA_COUNT }, (_, i) => {
  const x = (i - 3) * PITCH;
  const edge = Math.min(0.97, Math.abs(x) + PITCH * 0.25);
  const chord = 2 * Math.sqrt(1 - edge * edge);
  return {
    index: i,
    x,
    y: Y_OFFSET[i],
    width: PITCH - GAP,
    height: Math.max(0.92, chord) * HEIGHT_TWEAK[i],
    depth: (0.05 + 0.05 * (1 - x * x)) * DEPTH_TWEAK[i],
    notch: i === 4 ? { y: 0.52, height: 0.17, depth: 0.052 } : null,
  };
});

function slabShape(w: number, h: number, notch: LamellaSpec['notch']): Shape {
  const r = Math.min(w * 0.45, 0.07);
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const s = new Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  if (notch) {
    const a = notch.y - notch.height / 2;
    const b = notch.y + notch.height / 2;
    const d = notch.depth;
    s.lineTo(x1, a);
    s.lineTo(x1 - d, a + d * 0.7);
    s.lineTo(x1 - d, b - d * 0.7);
    s.lineTo(x1, b);
  }
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

interface Detail {
  curve: number;
  maxEdge: number;
  profile: number;
  rings: number;
}

const DETAIL: Record<Quality, Detail> = {
  high: { curve: 8, maxEdge: 0.06, profile: 10, rings: 7 },
  low: { curve: 4, maxEdge: 0.1, profile: 6, rings: 4 },
};

function outline(spec: LamellaSpec, d: Detail): Vector2[] {
  const raw = slabShape(spec.width - EDGE_RADIUS * 2, spec.height - EDGE_RADIUS * 2, spec.notch).getPoints(d.curve);
  const pts: Vector2[] = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    const b = raw[(i + 1) % raw.length];
    if (a.distanceTo(b) < 1e-6) continue;
    const steps = Math.max(1, Math.ceil(a.distanceTo(b) / d.maxEdge));
    for (let s = 0; s < steps; s++) pts.push(a.clone().lerp(b, s / steps));
  }
  return pts;
}

/**
 * Geometry for one lamella, centred on its own origin: an outline with a rounded
 * edge whose thickness follows the lens-space sphere, so the seven slabs together
 * form one biconvex profile. The curvature is what makes the glass refract.
 */
export function createLamellaGeometry(spec: LamellaSpec, quality: Quality): BufferGeometry {
  const d = DETAIL[quality];
  const pts = outline(spec, d);
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  const ccw = area > 0 ? 1 : -1;

  const normals = pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const e0 = new Vector2(p.x - prev.x, p.y - prev.y).normalize();
    const e1 = new Vector2(next.x - p.x, next.y - p.y).normalize();
    const n0 = new Vector2(e0.y, -e0.x).multiplyScalar(ccw);
    const n1 = new Vector2(e1.y, -e1.x).multiplyScalar(ccw);
    const m = n0.clone().add(n1).normalize();
    return m.multiplyScalar(Math.min(2, 1 / Math.max(0.5, m.dot(n0))));
  });

  const halfThickness = (x: number, y: number) => {
    const lx = spec.x + x;
    const ly = spec.y + y;
    return spec.depth / 2 + BULGE * Math.max(0, 1 - (lx * lx + ly * ly));
  };

  const positions: number[] = [];
  const push = (x: number, y: number, z: number) => positions.push(x, y, z) / 3 - 1;

  const profile: number[][] = [];
  for (let j = 0; j <= d.profile; j++) {
    const phi = -Math.PI / 2 + (Math.PI * j) / d.profile;
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    profile.push(
      pts.map((p, k) => {
        const off = normals[k];
        return push(p.x + off.x * EDGE_RADIUS * c, p.y + off.y * EDGE_RADIUS * c, halfThickness(p.x, p.y) * sn);
      }),
    );
  }

  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x / n;
    cy += p.y / n;
  }
  const cap = (side: 1 | -1, outer: number[]): { rings: number[][]; centre: number } => {
    const rings = [outer];
    for (let m = 1; m < d.rings; m++) {
      const t = 1 - m / d.rings;
      rings.push(
        pts.map((p) => {
          const x = cx + (p.x - cx) * t;
          const y = cy + (p.y - cy) * t;
          return push(x, y, side * halfThickness(x, y));
        }),
      );
    }
    return { rings, centre: push(cx, cy, side * halfThickness(cx, cy)) };
  };
  const front = cap(1, profile[d.profile]);
  const back = cap(-1, profile[0]);

  const index: number[] = [];
  const tri = (a: number, b: number, c: number, flip: boolean) => (flip ? index.push(a, c, b) : index.push(a, b, c));
  const strip = (outer: number[], inner: number[], flip: boolean) => {
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      tri(outer[k], outer[k1], inner[k1], flip);
      tri(outer[k], inner[k1], inner[k], flip);
    }
  };
  // With a CCW outline, walking outer→inner toward +z faces outward; mirror for the other orientation.
  const cw = ccw < 0;
  for (let j = 0; j < d.profile; j++) strip(profile[j], profile[j + 1], cw);
  for (const [part, flip] of [[front, cw], [back, !cw]] as const) {
    for (let m = 0; m < part.rings.length - 1; m++) strip(part.rings[m], part.rings[m + 1], flip);
    const last = part.rings[part.rings.length - 1];
    for (let k = 0; k < n; k++) tri(last[k], last[(k + 1) % n], part.centre, flip);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();

  // Caps are the analytic surface z = ±h(x, y); exact normals avoid shading creases
  // along the long, thin fan triangles (most visible from the notch).
  const pos = geometry.getAttribute('position');
  const nrm = geometry.getAttribute('normal');
  const v = new Vector3();
  for (const [part, side] of [[front, 1], [back, -1]] as const) {
    for (const i of [...part.rings.flat(), part.centre]) {
      const lx = spec.x + pos.getX(i);
      const ly = spec.y + pos.getY(i);
      const inside = lx * lx + ly * ly < 1 ? 1 : 0;
      v.set(2 * BULGE * lx * inside * side, 2 * BULGE * ly * inside * side, side).normalize();
      nrm.setXYZ(i, v.x, v.y, v.z);
    }
  }
  geometry.computeBoundingSphere();
  return geometry;
}

export function createLamellaGeometries(quality: Quality): BufferGeometry[] {
  return LAMELLA_SPECS.map((spec) => createLamellaGeometry(spec, quality));
}
