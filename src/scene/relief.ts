import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  PlaneGeometry,
  SRGBColorSpace,
  ShaderMaterial,
} from 'three';
import { createNoise2D, fbm } from './noise';

export const RELIEF_SIZE = 2.4;
export const RELIEF_BASE = -0.28;
export const RELIEF_MAX = 0.62;
export const CONTOUR_STEP = 0.035;

export interface ReliefField {
  segments: number;
  /** (segments + 1)² heights, row-major over z then x, from -size/2 to +size/2. */
  heights: Float32Array;
}

export function createReliefField(segments: number): ReliefField {
  const noise = createNoise2D(1907);
  const n = segments + 1;
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i / segments - 0.5) * RELIEF_SIZE;
      const z = (j / segments - 0.5) * RELIEF_SIZE;
      const wx = fbm(noise, x * 0.8 + 5.2, z * 0.8 + 1.3, 3) * 0.55;
      const wz = fbm(noise, x * 0.8 - 3.7, z * 0.8 + 7.9, 3) * 0.55;
      const base = fbm(noise, x * 0.85 + wx, z * 0.85 + wz, 4);
      const ridge = 1 - Math.abs(fbm(noise, x * 1.3 - wz, z * 1.3 + wx, 3));
      const mound = Math.pow(Math.min(1, Math.max(0, base * 0.9 + 0.5)), 1.7);
      const h = 0.03 + RELIEF_MAX * (0.85 * mound + 0.15 * mound * ridge * ridge);
      heights[j * n + i] = Math.min(RELIEF_MAX, h);
    }
  }
  return { segments, heights };
}

export function createReliefTop(field: ReliefField): BufferGeometry {
  const { segments, heights } = field;
  const geometry = new PlaneGeometry(RELIEF_SIZE, RELIEF_SIZE, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.getAttribute('position');
  const n = segments + 1;
  for (let k = 0; k < pos.count; k++) {
    const i = Math.round((pos.getX(k) / RELIEF_SIZE + 0.5) * segments);
    const j = Math.round((pos.getZ(k) / RELIEF_SIZE + 0.5) * segments);
    pos.setY(k, heights[j * n + i]);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Cut sides and bottom of the block, so the contour shader draws strata on the walls. */
export function createReliefSkirt(field: ReliefField): BufferGeometry {
  const { segments, heights } = field;
  const n = segments + 1;
  const half = RELIEF_SIZE / 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], nx: number, ny: number, nz: number) => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let k = 0; k < 6; k++) normals.push(nx, ny, nz);
  };
  const h = (i: number, j: number) => heights[j * n + i];
  const coord = (t: number) => (t / segments - 0.5) * RELIEF_SIZE;
  for (let t = 0; t < segments; t++) {
    const x0 = coord(t);
    const x1 = coord(t + 1);
    quad([x0, RELIEF_BASE, half], [x1, RELIEF_BASE, half], [x1, h(t + 1, segments), half], [x0, h(t, segments), half], 0, 0, 1);
    quad([x1, RELIEF_BASE, -half], [x0, RELIEF_BASE, -half], [x0, h(t, 0), -half], [x1, h(t + 1, 0), -half], 0, 0, -1);
    quad([half, RELIEF_BASE, x1], [half, RELIEF_BASE, x0], [half, h(segments, t), x0], [half, h(segments, t + 1), x1], 1, 0, 0);
    quad([-half, RELIEF_BASE, x0], [-half, RELIEF_BASE, x1], [-half, h(0, t + 1), x1], [-half, h(0, t), x0], -1, 0, 0);
  }
  quad([-half, RELIEF_BASE, -half], [half, RELIEF_BASE, -half], [half, RELIEF_BASE, half], [-half, RELIEF_BASE, half], 0, -1, 0);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

const RELIEF_VERT = /* glsl */ `
  uniform float uBreath;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vec3 p = position;
    float top = step(0.0, p.y);
    p.y *= mix(1.0, uBreath, top);
    vec3 n = normalize(mix(normal, vec3(normal.x * uBreath, normal.y, normal.z * uBreath), top));
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const RELIEF_FRAG = /* glsl */ `
  uniform vec3 uLow;
  uniform vec3 uHigh;
  uniform vec3 uLine;
  uniform vec3 uLight;
  uniform float uStep;
  uniform float uMax;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  float isoline(float v, float width) {
    float fw = max(fwidth(v), 1e-4);
    float d = abs(fract(v - 0.5) - 0.5) / fw;
    return (1.0 - smoothstep(width - 0.5, width + 0.5, d)) * (1.0 - smoothstep(0.3, 0.7, fw));
  }

  void main() {
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    float h = vWorld.y;
    float t = clamp(h / uMax, 0.0, 1.0);
    vec3 base = mix(uLow, uHigh, smoothstep(0.0, 1.0, t));
    float diffuse = max(dot(n, normalize(uLight)), 0.0);
    float hemi = 0.5 + 0.5 * n.y;
    vec3 color = base * (0.28 + 0.8 * diffuse + 0.22 * hemi);
    // Heights are read from the displayed surface, so the lines stay exact while it breathes.
    float minor = isoline(h / uStep, 0.45);
    float major = isoline(h / (uStep * 5.0), 0.75);
    float strata = mix(0.4, 1.0, abs(n.y));
    color = mix(color, uLine, clamp(minor * 0.2 + major * 0.55, 0.0, 0.7) * strata);
    vec3 v = normalize(cameraPosition - vWorld);
    color += pow(1.0 - max(dot(n, v), 0.0), 4.0) * 0.04;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createContourMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: 'Contour Relief',
    uniforms: {
      uBreath: { value: 1 },
      uLow: { value: new Color('#171b18') },
      uHigh: { value: new Color('#4a524c') },
      uLine: { value: new Color('#f7f6f0') },
      uLight: { value: [0.55, 0.75, 0.35] },
      uStep: { value: CONTOUR_STEP },
      uMax: { value: RELIEF_MAX },
    },
    vertexShader: RELIEF_VERT,
    fragmentShader: RELIEF_FRAG,
  });
}

/** Contour lines baked into a texture so the exported GLB keeps the look with a standard material. */
export function bakeContourTexture(field: ReliefField, size: number): CanvasTexture {
  const { segments, heights } = field;
  const n = segments + 1;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  if (!ctx) return tex;

  const sample = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const gz = (y / (size - 1)) * segments;
    const j = Math.min(segments - 1, Math.floor(gz));
    const fz = gz - j;
    for (let x = 0; x < size; x++) {
      const gx = (x / (size - 1)) * segments;
      const i = Math.min(segments - 1, Math.floor(gx));
      const fx = gx - i;
      const a = heights[j * n + i];
      const b = heights[j * n + i + 1];
      const c = heights[(j + 1) * n + i];
      const d = heights[(j + 1) * n + i + 1];
      sample[y * size + x] = (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
    }
  }

  const low = [0x17, 0x1b, 0x18];
  const high = [0x4a, 0x52, 0x4c];
  const line = [0xf7, 0xf6, 0xf0];
  const image = ctx.createImageData(size, size);
  const iso = (v: number, grad: number, width: number) => {
    const d = Math.abs(v - Math.round(v)) / Math.max(grad, 1e-4);
    return 1 - Math.min(1, Math.max(0, d - width + 0.5));
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const k = y * size + x;
      const h = sample[k];
      const hx = sample[y * size + Math.min(size - 1, x + 1)] - h;
      const hy = sample[Math.min(size - 1, y + 1) * size + x] - h;
      const g = Math.hypot(hx, hy);
      const t = Math.min(1, h / RELIEF_MAX);
      const s = t * t * (3 - 2 * t);
      const shade = 0.75 + 0.5 * Math.max(-0.5, Math.min(0.5, (-hx * 0.6 + hy * 0.8) * size * 0.25));
      const minor = iso(h / CONTOUR_STEP, g / CONTOUR_STEP, 0.7);
      const major = iso(h / (CONTOUR_STEP * 5), g / (CONTOUR_STEP * 5), 1.1);
      const m = Math.min(0.7, minor * 0.2 + major * 0.55);
      for (let c = 0; c < 3; c++) {
        const base = (low[c] + (high[c] - low[c]) * s) * shade;
        image.data[k * 4 + c] = Math.round(base + (line[c] - base) * m);
      }
      image.data[k * 4 + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  tex.needsUpdate = true;
  return tex;
}
