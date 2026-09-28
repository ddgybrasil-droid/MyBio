import { AdditiveBlending, Color, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';

/** [x, width] in bar-plane units. */
const BARS: [number, number][] = [
  [-2.3, 0.05],
  [-0.95, 0.018],
  [-0.3, 0.07],
  [0.85, 0.028],
  [2.1, 0.045],
];
const HEIGHT = 5.4;

/** Unit plane whose vertex colours fade to black at both ends, like a soft strip light. */
function stripGeometry(): PlaneGeometry {
  const geometry = new PlaneGeometry(1, 1, 1, 8);
  const pos = geometry.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = 1 - Math.abs(pos.getY(i)) * 2;
    const k = Math.pow(Math.max(0, t), 0.6);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = k;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

/** Broad, very dim panel with a soft falloff; seen warped through glass it reveals the transparency. */
function panelGeometry(): PlaneGeometry {
  const geometry = new PlaneGeometry(1, 1, 12, 12);
  const pos = geometry.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const r = Math.min(1, Math.hypot(pos.getX(i) * 2, pos.getY(i) * 2));
    const k = Math.pow(1 - r * r, 2);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = k;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Additive so faded (black) regions leave the exact clear colour untouched; kept
 * non-transparent so the lights stay in the opaque list that transmission samples.
 */
function emissive(color: Color): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, vertexColors: true, blending: AdditiveBlending, depthWrite: false });
}

/**
 * Thin unlit strip lights behind the specimen. Parented to the camera so they
 * always sit behind the object and give the glass something to refract and split.
 */
export class LightBars {
  readonly group = new Group();
  private readonly geometry = stripGeometry();
  private readonly material = emissive(new Color(1.1, 1.07, 1.02));
  private panel: { geometry: PlaneGeometry; material: MeshBasicMaterial } | null = null;

  constructor(distance: number, softbox = false) {
    if (softbox) {
      const geometry = panelGeometry();
      const material = emissive(new Color(0.05, 0.049, 0.046));
      const panel = new Mesh(geometry, material);
      panel.position.set(0.2, 0.3, -distance - 0.01);
      panel.scale.set(7, 5.5, 1);
      this.group.add(panel);
      this.panel = { geometry, material };
    }
    for (const [x, w] of BARS) {
      const bar = new Mesh(this.geometry, this.material);
      bar.position.set(x, 0, -distance);
      bar.scale.set(w, HEIGHT, 1);
      this.group.add(bar);
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.panel?.geometry.dispose();
    this.panel?.material.dispose();
  }
}
