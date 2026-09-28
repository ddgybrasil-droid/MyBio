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
  const X = (v: number) => cx + v * u;
  const Y = (v: number) => cy - v * u;

  const layer = document.createElement('canvas');
  layer.width = W;
  layer.height = H;
  const m = layer.getContext('2d');
  const ctx = target.getContext('2d');
  if (!m || !ctx) return;

  // Supporting luminous field only — soft wash the glass can bend.
  // No dense rulings / rays / registration corners that fight the optic.
  const wash = m.createRadialGradient(cx - 0.12 * u, cy - 0.18 * u, 0.05 * u, cx, cy, 1.7 * u);
  wash.addColorStop(0, 'rgba(255,255,255,0.78)');
  wash.addColorStop(0.35, 'rgba(255,252,246,0.28)');
  wash.addColorStop(0.7, 'rgba(210,220,218,0.1)');
  wash.addColorStop(1, 'rgba(21,24,22,0)');
  m.fillStyle = wash;
  m.fillRect(0, 0, W, H);

  // Cool rim veil so refraction picks a quiet temperature shift (reads as depth).
  const cool = m.createLinearGradient(X(-1.4), Y(1.2), X(1.4), Y(-1.2));
  cool.addColorStop(0, 'rgba(180, 205, 210, 0.1)');
  cool.addColorStop(0.5, 'rgba(180, 205, 210, 0)');
  cool.addColorStop(1, 'rgba(160, 175, 170, 0.08)');
  m.fillStyle = cool;
  m.fillRect(0, 0, W, H);

  // Single faint aperture ring — one optical cue, not a target board.
  m.strokeStyle = ink;
  m.lineWidth = Math.max(1, u * 0.0032);
  m.globalAlpha = 0.1;
  m.beginPath();
  m.arc(cx, cy, 0.92 * u, 0, Math.PI * 2);
  m.stroke();

  // Whisper S7 watermark for thickness cue through clear glass.
  m.globalAlpha = 0.045;
  m.fillStyle = ink;
  m.font = `600 ${Math.round(1.4 * u)}px "Onest Variable", Onest, system-ui, sans-serif`;
  m.textAlign = 'center';
  m.textBaseline = 'middle';
  m.fillText('S7', cx, cy);

  maskRect(m, X(-1.44), X(1.44), Y(1.3), Y(-1.3), 0.18 * u);

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
