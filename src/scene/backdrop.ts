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
  SRGBColorSpace,
  ShaderMaterial,
  ZeroFactor,
} from 'three';

/** Bench card size in lens units (lens radius = 1). */
export const BENCH_W = 4.6;
export const BENCH_H = 3.0;

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

function drawBench(target: HTMLCanvasElement, bg: string, ink: string): void {
  const W = target.width;
  const H = target.height;
  const u = W / BENCH_W;
  const cx = W / 2;
  const cy = H / 2;
  const hair = Math.max(1, u * 0.005);

  const layer = document.createElement('canvas');
  layer.width = W;
  layer.height = H;
  const m = layer.getContext('2d');
  const ctx = target.getContext('2d');
  if (!m || !ctx) return;

  m.fillStyle = ink;
  m.strokeStyle = ink;

  m.globalAlpha = 0.06;
  m.font = `620 ${Math.round(1.95 * u)}px "Onest Variable", Onest, system-ui, sans-serif`;
  m.textAlign = 'center';
  m.textBaseline = 'alphabetic';
  const glyph = m.measureText('S7');
  const ascent = glyph.actualBoundingBoxAscent || 1.5 * u;
  m.fillText('S7', cx + 0.04 * u, cy + ascent / 2);

  // Ruled test target: horizontal hairlines behind the optic make every lamella's offset legible.
  const ruling = document.createElement('canvas');
  ruling.width = W;
  ruling.height = H;
  const r = ruling.getContext('2d');
  if (r) {
    r.fillStyle = ink;
    const pitch = 0.055 * u;
    const lineH = Math.max(1, u * 0.0045);
    for (let y = cy - 1.05 * u; y <= cy + 1.05 * u; y += pitch) {
      r.fillRect(cx - 1.3 * u, Math.round(y), 2.6 * u, lineH);
    }
    r.globalCompositeOperation = 'destination-in';
    const fade = r.createLinearGradient(cx - 1.3 * u, 0, cx + 1.3 * u, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(0.2, 'rgba(0,0,0,1)');
    fade.addColorStop(0.8, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    r.fillStyle = fade;
    r.fillRect(0, 0, W, H);
    const fadeY = r.createLinearGradient(0, cy - 1.05 * u, 0, cy + 1.05 * u);
    fadeY.addColorStop(0, 'rgba(0,0,0,0)');
    fadeY.addColorStop(0.25, 'rgba(0,0,0,1)');
    fadeY.addColorStop(0.75, 'rgba(0,0,0,1)');
    fadeY.addColorStop(1, 'rgba(0,0,0,0)');
    r.fillStyle = fadeY;
    r.fillRect(0, 0, W, H);
    m.globalAlpha = 0.13;
    m.drawImage(ruling, 0, 0);
  }

  m.globalAlpha = 0.34;
  m.lineWidth = hair;
  m.beginPath();
  m.moveTo(cx - 2.1 * u, cy);
  m.lineTo(cx + 2.1 * u, cy);
  for (let k = -20; k <= 20; k++) {
    const x = Math.round(cx + k * 0.1 * u) + 0.5;
    const len = k % 10 === 0 ? 0.13 * u : k % 5 === 0 ? 0.075 * u : 0.035 * u;
    m.moveTo(x, cy);
    m.lineTo(x, cy - len);
  }
  m.stroke();

  m.globalAlpha = 0.18;
  m.beginPath();
  for (const side of [-1, 1]) {
    const x = Math.round(cx + side * 1.8 * u) + 0.5;
    m.moveTo(x, cy - 1.2 * u);
    m.lineTo(x, cy + 1.2 * u);
    for (const edge of [-1, 1]) {
      const y = Math.round(cy + edge * 1.08 * u) + 0.5;
      m.moveTo(x, y);
      m.lineTo(x - side * 0.42 * u, y);
    }
  }
  m.moveTo(cx - 0.32 * u, Math.round(cy + 1.08 * u) + 0.5);
  m.lineTo(cx + 0.32 * u, Math.round(cy + 1.08 * u) + 0.5);
  m.stroke();

  const mono = (size: number) => `500 ${Math.round(size * u)}px "IBM Plex Mono", ui-monospace, monospace`;
  m.globalAlpha = 0.46;
  m.font = mono(0.048);
  m.textBaseline = 'top';
  for (let k = -10; k <= 10; k += 10) {
    m.textAlign = 'center';
    m.fillText(k === 0 ? '0' : `${k > 0 ? '' : '\u2212'}${Math.abs(k)}`, cx + k * 0.1 * u, cy + 0.05 * u);
  }
  m.font = mono(0.052);
  const labelY = cy - 1.18 * u;
  m.textAlign = 'left';
  m.fillText('S7 / OPTICAL BENCH', cx - 1.74 * u, labelY);
  m.fillText('n 1.480 \u00b7 f 42.0 mm', cx - 1.74 * u, cy + 0.98 * u);
  m.textAlign = 'right';
  m.fillText('\u03bb 587.6 nm', cx + 1.74 * u, labelY);
  m.fillText('07 LAMELLAE', cx + 1.74 * u, cy + 0.98 * u);

  // Fade every mark to zero well inside the card, so its border is the pure background colour.
  m.globalAlpha = 1;
  m.globalCompositeOperation = 'destination-in';
  const gx = m.createLinearGradient(0, 0, W, 0);
  gx.addColorStop(0, 'rgba(0,0,0,0)');
  gx.addColorStop(0.09, 'rgba(0,0,0,1)');
  gx.addColorStop(0.91, 'rgba(0,0,0,1)');
  gx.addColorStop(1, 'rgba(0,0,0,0)');
  m.fillStyle = gx;
  m.fillRect(0, 0, W, H);
  const gy = m.createLinearGradient(0, 0, 0, H);
  gy.addColorStop(0, 'rgba(0,0,0,0)');
  gy.addColorStop(0.06, 'rgba(0,0,0,1)');
  gy.addColorStop(0.94, 'rgba(0,0,0,1)');
  gy.addColorStop(1, 'rgba(0,0,0,0)');
  m.fillStyle = gy;
  m.fillRect(0, 0, W, H);

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
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: DstColorFactor,
        blendDst: ZeroFactor,
        blendSrcAlpha: ZeroFactor,
        blendDstAlpha: OneFactor,
        depthTest: false,
        depthWrite: false,
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
