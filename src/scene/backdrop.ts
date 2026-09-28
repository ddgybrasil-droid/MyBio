import {
  AddEquation,
  CanvasTexture,
  Color,
  CustomBlending,
  DataTexture,
  DstColorFactor,
  LinearFilter,
  Mesh,
  OneFactor,
  PlaneGeometry,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  ShaderMaterial,
  ZeroFactor,
} from 'three';

/** Bench card size in lens units (lens radius = 1). */
export const BENCH_W = 3.2;
export const BENCH_H = 2.9;

const BENCH_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BENCH_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 background;
  uniform float strength;
  varying vec2 vUv;
  void main() {
    vec3 marks = texture2D(map, vUv).rgb;
    gl_FragColor = vec4(mix(background, marks, strength), 1.0);
    #include <colorspace_fragment>
  }
`;

/** Multiplies `ctx` by a soft-edged rectangle (in canvas px), fading marks to zero outside it. */
function maskRect(ctx: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, feather: number): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  const gx = ctx.createLinearGradient(x0 - feather, 0, x1 + feather, 0);
  const fx = feather / (x1 - x0 + 2 * feather);
  gx.addColorStop(0, 'rgba(0,0,0,0)');
  gx.addColorStop(fx, 'rgba(0,0,0,1)');
  gx.addColorStop(1 - fx, 'rgba(0,0,0,1)');
  gx.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, W, H);
  const gy = ctx.createLinearGradient(0, y0 - feather, 0, y1 + feather);
  const fy = feather / (y1 - y0 + 2 * feather);
  gy.addColorStop(0, 'rgba(0,0,0,0)');
  gy.addColorStop(fy, 'rgba(0,0,0,1)');
  gy.addColorStop(1 - fy, 'rgba(0,0,0,1)');
  gy.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gy;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/**
 * Test card the lens refracts. Everything sits within ~1.4 lens radii of the optic,
 * and every stroke is either crisp ink or a flat ink tint, so the offset each slab
 * applies reads as a clean break in a line.
 */
function drawBench(target: HTMLCanvasElement, bg: string, ink: string): void {
  const W = target.width;
  const H = target.height;
  const u = W / BENCH_W;
  const cx = W / 2;
  const cy = H / 2;
  const hair = Math.max(1, u * 0.0042);
  const X = (v: number) => cx + v * u;
  const Y = (v: number) => cy - v * u;
  const snap = (v: number) => Math.round(v) + 0.5;

  const layer = document.createElement('canvas');
  layer.width = W;
  layer.height = H;
  const m = layer.getContext('2d');
  const ctx = target.getContext('2d');
  if (!m || !ctx) return;
  m.fillStyle = ink;
  m.strokeStyle = ink;
  m.lineCap = 'butt';

  m.globalAlpha = 0.15;
  m.font = `680 ${Math.round(1.9 * u)}px "Onest Variable", Onest, system-ui, sans-serif`;
  m.textAlign = 'center';
  m.textBaseline = 'alphabetic';
  const glyph = m.measureText('S7');
  const ascent = glyph.actualBoundingBoxAscent || 1.4 * u;
  m.fillText('S7', X(0.02), cy + ascent / 2);

  // Ruled target with ruler-like weights: a periodic ruling alone would alias under a
  // one-pitch shift, the heavier fifth lines keep each slab's offset unambiguous.
  const ruling = document.createElement('canvas');
  ruling.width = W;
  ruling.height = H;
  const r = ruling.getContext('2d');
  if (r) {
    r.fillStyle = ink;
    const pitch = 0.05 * u;
    const rows = 20;
    for (let k = -rows; k <= rows; k++) {
      const major = k % 5 === 0;
      const lineH = major ? Math.max(1.5, u * 0.0085) : Math.max(1, u * 0.004);
      r.globalAlpha = major ? 0.42 : 0.2;
      r.fillRect(X(-1.18), Math.round(cy + k * pitch - lineH / 2), 2.36 * u, lineH);
    }
    maskRect(r, X(-1.02), X(1.02), Y(0.92), Y(-0.92), 0.16 * u);
    m.globalAlpha = 1;
    m.drawImage(ruling, 0, 0);
  }

  m.lineWidth = hair;
  m.globalAlpha = 0.36;
  m.beginPath();
  m.arc(cx, cy, 1.06 * u, 0, Math.PI * 2);
  m.stroke();
  m.beginPath();
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2;
    const len = k % 6 === 0 ? 0.07 * u : 0.03 * u;
    m.moveTo(cx + Math.cos(a) * 1.06 * u, cy + Math.sin(a) * 1.06 * u);
    m.lineTo(cx + Math.cos(a) * (1.06 * u + len), cy + Math.sin(a) * (1.06 * u + len));
  }
  m.stroke();

  // Paraxial rays converging on the focal point: diagonals break visibly at every slab edge.
  m.globalAlpha = 0.5;
  m.lineWidth = Math.max(1, u * 0.0055);
  const focus = 1.3;
  m.beginPath();
  for (const h of [-0.78, -0.46, -0.16, 0.16, 0.46, 0.78]) {
    m.moveTo(X(-1.14), Y(h));
    m.lineTo(X(-0.9), Y(h));
    m.lineTo(X(focus), Y(0));
  }
  m.stroke();

  m.globalAlpha = 0.62;
  m.lineWidth = hair;
  m.beginPath();
  m.moveTo(X(-1.36), snap(cy));
  m.lineTo(X(1.36), snap(cy));
  m.moveTo(snap(cx), Y(1.18));
  m.lineTo(snap(cx), Y(-1.18));
  for (let k = -26; k <= 26; k++) {
    const x = snap(X(k * 0.05));
    const len = k % 10 === 0 ? 0.1 * u : k % 5 === 0 ? 0.06 * u : 0.028 * u;
    m.moveTo(x, cy);
    m.lineTo(x, cy - len);
  }
  for (let k = -22; k <= 22; k++) {
    if (k === 0) continue;
    const y = snap(Y(k * 0.05));
    const len = k % 10 === 0 ? 0.08 * u : k % 5 === 0 ? 0.05 * u : 0.022 * u;
    m.moveTo(cx, y);
    m.lineTo(cx + len, y);
  }
  m.stroke();

  m.beginPath();
  m.arc(X(focus), cy, 0.022 * u, 0, Math.PI * 2);
  m.fill();

  // Registration corners.
  m.globalAlpha = 0.55;
  m.beginPath();
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x = snap(X(sx * 1.36));
      const y = snap(Y(sy * 1.2));
      m.moveTo(x - sx * 0.16 * u, y);
      m.lineTo(x, y);
      m.lineTo(x, y + sy * 0.16 * u);
    }
  }
  m.stroke();

  const mono = (size: number) => `500 ${Math.round(size * u)}px "IBM Plex Mono", ui-monospace, monospace`;
  m.globalAlpha = 0.62;
  m.font = mono(0.042);
  m.textBaseline = 'top';
  m.textAlign = 'center';
  for (const k of [-1, 1]) m.fillText(k < 0 ? '\u22121.0' : '1.0', X(k), cy + 0.03 * u);
  m.fillText('F', X(focus), cy + 0.045 * u);
  m.font = mono(0.046);
  m.textAlign = 'left';
  m.textBaseline = 'alphabetic';
  m.fillText('S7 / OPTICAL BENCH', X(-1.3), Y(1.13));
  m.textBaseline = 'top';
  m.fillText('n 1.480 \u00b7 f 42.0 mm', X(-1.3), Y(-1.13));
  m.textAlign = 'right';
  m.textBaseline = 'alphabetic';
  m.fillText('\u03bb 587.6 nm', X(1.3), Y(1.13));
  m.textBaseline = 'top';
  m.fillText('07 LAMELLAE', X(1.3), Y(-1.13));

  // The card border must be the exact background colour.
  maskRect(m, X(-1.44), X(1.44), Y(1.3), Y(-1.3), 0.1 * u);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(layer, 0, 0);
}

/**
 * Opaque card behind the lens. It is exactly background-coloured (not tone mapped),
 * so it is invisible except for its marks, and it lands in the transmission pass,
 * which is what the glass refracts.
 */
export class Bench {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: CanvasTexture;

  constructor(
    background: Color,
    private readonly bgHex: string,
    private readonly inkHex: string,
    width: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = Math.round((width * BENCH_H) / BENCH_W);
    drawBench(this.canvas, bgHex, inkHex);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const material = new ShaderMaterial({
      name: 'S7 Bench',
      uniforms: {
        map: { value: this.texture },
        background: { value: background.clone() },
        strength: { value: 1 },
      },
      vertexShader: BENCH_VERT,
      fragmentShader: BENCH_FRAG,
      depthWrite: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(BENCH_W, BENCH_H), material);
    this.mesh.renderOrder = -2;
    this.mesh.frustumCulled = false;
  }

  set strength(value: number) {
    this.mesh.material.uniforms.strength.value = value;
  }

  redraw(): void {
    drawBench(this.canvas, this.bgHex, this.inkHex);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/** Opaque-pass multiply (kept non-transparent so the transmission pass still sees it). */
const MULTIPLY = {
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: DstColorFactor,
  blendDst: ZeroFactor,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
  depthTest: false,
  depthWrite: false,
} as const;

const RAIL_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform float strength;
  uniform float repeat;
  varying vec2 vUv;
  void main() {
    float marks = texture2D(map, vec2(vUv.x, vUv.y * repeat)).r;
    float fade = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
    gl_FragColor = vec4(vec3(1.0 - marks * strength * fade), 1.0);
    #include <colorspace_fragment>
  }
`;

/** Rail texture: one lens unit tall, one wide; red channel is ink coverage. */
function createRailTexture(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#fff';
    const c = size / 2;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(c - 1, 0, 2, size);
    for (let k = 0; k < 20; k++) {
      const y = Math.round((k / 20) * size);
      const half = k % 10 === 0 ? 0.3 : k % 5 === 0 ? 0.2 : 0.09;
      ctx.globalAlpha = k % 5 === 0 ? 0.5 : 0.32;
      ctx.fillRect(Math.round(c - half * size), y, Math.round(2 * half * size), k % 5 === 0 ? 3 : 2);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  return texture;
}

/**
 * Two tick rulers standing behind the lab shutters, at the viewport edges, so the
 * louvres have something to refract without covering the bench content. Multiplied
 * like the shadows, so while fading out they never paint over the bench card.
 */
export class Rails {
  readonly meshes: Mesh<PlaneGeometry, ShaderMaterial>[] = [];
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly texture = createRailTexture();

  constructor() {
    for (let i = 0; i < 2; i++) {
      const material = new ShaderMaterial({
        name: 'S7 Lab Rail',
        uniforms: {
          map: { value: this.texture },
          strength: { value: 0 },
          repeat: { value: 1 },
        },
        vertexShader: BENCH_VERT,
        fragmentShader: RAIL_FRAG,
        ...MULTIPLY,
      });
      const mesh = new Mesh(this.geometry, material);
      mesh.renderOrder = -1;
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.meshes.push(mesh);
    }
  }

  /** `x`, `y`, `width`, `height` in world units on the bench plane; `unit` is one lens unit there. */
  place(i: number, x: number, y: number, z: number, width: number, height: number, unit: number, strength: number): void {
    const mesh = this.meshes[i];
    mesh.visible = strength > 1e-3;
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, 1);
    mesh.material.uniforms.strength.value = strength;
    mesh.material.uniforms.repeat.value = height / Math.max(1e-4, unit);
  }

  dispose(): void {
    this.geometry.dispose();
    this.texture.dispose();
    for (const mesh of this.meshes) mesh.material.dispose();
  }
}

const SHADOW_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform float strength;
  uniform vec3 tint;
  varying vec2 vUv;
  void main() {
    float a = texture2D(map, vUv).r * strength;
    gl_FragColor = vec4(mix(vec3(1.0), tint, a), 1.0);
    #include <colorspace_fragment>
  }
`;

function createBlobTexture(): DataTexture {
  const w = 64;
  const h = 128;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = ((x + 0.5) / w) * 2 - 1;
      const v = ((y + 0.5) / h) * 2 - 1;
      const qx = Math.abs(u) - 0.38;
      const qy = Math.abs(v) - 0.6;
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const d = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0);
      const t = Math.min(1, Math.max(0, (d + 0.2) / 0.62));
      const a = Math.pow(1 - t * t * (3 - 2 * t), 1.6);
      const i = (y * w + x) * 4;
      const byte = Math.round(a * 255);
      data[i] = data[i + 1] = data[i + 2] = byte;
      data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, w, h, RGBAFormat);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Soft contact shadows, multiplied onto the bench inside the opaque pass so glass refracts them too. */
export class LamellaShadows {
  readonly meshes: Mesh<PlaneGeometry, ShaderMaterial>[] = [];
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly texture = createBlobTexture();

  constructor(count: number, tint: Color) {
    for (let i = 0; i < count; i++) {
      const material = new ShaderMaterial({
        name: 'S7 Contact Shadow',
        uniforms: {
          map: { value: this.texture },
          strength: { value: 0 },
          tint: { value: tint },
        },
        vertexShader: BENCH_VERT,
        fragmentShader: SHADOW_FRAG,
        ...MULTIPLY,
      });
      const mesh = new Mesh(this.geometry, material);
      mesh.renderOrder = -1;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.texture.dispose();
    for (const mesh of this.meshes) mesh.material.dispose();
  }
}
