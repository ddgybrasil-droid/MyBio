import {
  AgXToneMapping,
  DirectionalLight,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
  type Texture,
} from 'three';
import type { SpecimenKind } from '../content';
import { state } from '../state';
import { createRoomEnvironment } from './glass';
import { OrbitRig } from './orbit';
import { tokenColor } from './palette';
import { createSpecimenModel, type SpecimenModel } from './specimen-models';
import { LightBars } from './studio';

export interface SpecimenSlot {
  kind: SpecimenKind;
  stage: HTMLElement;
  wireframe: boolean;
  viewer?: SpecimenViewer;
}

interface Mounted {
  renderer: WebGLRenderer;
  canvas: HTMLCanvasElement;
  scene: Scene;
  camera: PerspectiveCamera;
  model: SpecimenModel;
  rig: OrbitRig;
  bars: LightBars | null;
  env: Texture | null;
  detach: () => void;
  resize: ResizeObserver;
  lost: boolean;
}

export class SpecimenViewer {
  dirty = false;
  busy = false;
  onInteract: () => void = () => undefined;
  private m: Mounted | null = null;
  private wireframe = false;
  private readonly born = performance.now();

  constructor(
    readonly stage: HTMLElement,
    readonly kind: SpecimenKind,
    private readonly lite: boolean,
  ) {}

  get mounted(): boolean {
    return this.m !== null;
  }

  mount(): boolean {
    if (this.m) return true;
    const canvas = document.createElement('canvas');
    canvas.className = 'specimen__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        stencil: false,
        powerPreference: this.lite ? 'default' : 'high-performance',
      });
    } catch {
      return false;
    }
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = AgXToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(tokenColor('void'), 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lite ? 1.25 : 1.75));
    renderer.transmissionResolutionScale = this.lite ? 0.6 : 1;

    const model = createSpecimenModel(this.kind, { quality: this.lite ? 'low' : 'high', dispersion: !this.lite });
    const scene = new Scene();
    scene.add(model.root);
    let env: Texture | null = null;
    if (model.environmentIntensity > 0) {
      env = createRoomEnvironment(renderer, false);
      scene.environment = env;
      scene.environmentIntensity = model.environmentIntensity;
    }
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 5, 4);
    scene.add(key);

    const camera = new PerspectiveCamera(model.view.fov, 1, 0.1, 60);
    scene.add(camera);
    let bars: LightBars | null = null;
    if (model.studio) {
      bars = new LightBars(9, this.kind === 'lens');
      camera.add(bars.group);
    }

    const rig = new OrbitRig(model.view);
    const detach = rig.attach(this.stage, () => {
      this.dirty = true;
      this.onInteract();
    });

    const resize = new ResizeObserver(() => this.resize());
    this.m = { renderer, canvas, scene, camera, model, rig, bars, env, detach, resize, lost: false };

    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      if (this.m) this.m.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      const m = this.m;
      if (!m) return;
      if (m.env) {
        m.env.dispose();
        m.env = createRoomEnvironment(m.renderer, false);
        m.scene.environment = m.env;
      }
      m.lost = false;
      this.dirty = true;
    });

    this.stage.appendChild(canvas);
    resize.observe(this.stage);
    this.resize();
    model.setWireframe(this.wireframe);
    this.dirty = true;
    return true;
  }

  private resize(): void {
    const m = this.m;
    if (!m) return;
    const w = Math.max(1, Math.round(this.stage.clientWidth));
    const h = Math.max(1, Math.round(this.stage.clientHeight));
    m.renderer.setSize(w, h, false);
    m.camera.aspect = w / h;
    m.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  /** `active` = the one viewer allowed to animate (idle turntable, breathing). */
  frame(now: number, dt: number, active: boolean): void {
    const m = this.m;
    if (!m || m.lost) return;
    const reduced = state.reducedMotion;
    const moving = m.rig.update(dt, now, active && !reduced, reduced);
    const animating = active && m.model.animated && !reduced;
    if (animating) m.model.update((now - this.born) / 1000);
    this.busy = moving || animating;
    if (!moving && !animating && !this.dirty) return;
    m.rig.apply(m.camera);
    m.renderer.render(m.scene, m.camera);
    this.dirty = false;
    this.stage.classList.add('is-live');
  }

  setWireframe(on: boolean): void {
    this.wireframe = on;
    this.m?.model.setWireframe(on);
    this.dirty = true;
  }

  reset(): void {
    this.m?.rig.reset();
    this.dirty = true;
  }

  unmount(): void {
    const m = this.m;
    if (!m) return;
    this.m = null;
    m.detach();
    m.resize.disconnect();
    m.model.dispose();
    m.bars?.dispose();
    m.env?.dispose();
    m.renderer.dispose();
    m.renderer.forceContextLoss();
    m.canvas.remove();
    this.stage.classList.remove('is-live');
    this.busy = false;
    this.dirty = false;
  }
}

/**
 * Lazily mounts viewers near the viewport, animates only the most visible one,
 * and disposes viewers that are far away so WebGL contexts stay bounded.
 */
export class SpecimenScheduler {
  private readonly viewers: SpecimenViewer[] = [];
  private readonly byStage = new Map<Element, SpecimenViewer>();
  private readonly ratios = new Map<SpecimenViewer, number>();
  private readonly observers: IntersectionObserver[] = [];
  private preferred: SpecimenViewer | null = null;
  private raf = 0;
  private last = 0;

  constructor(slots: SpecimenSlot[]) {
    const lite = state.tier < 2;
    for (const slot of slots) {
      const viewer = new SpecimenViewer(slot.stage, slot.kind, lite);
      viewer.setWireframe(slot.wireframe);
      viewer.onInteract = () => {
        this.preferred = viewer;
        this.wake();
      };
      slot.viewer = viewer;
      this.viewers.push(viewer);
      this.byStage.set(slot.stage, viewer);
      this.ratios.set(viewer, 0);
    }

    this.observe({ rootMargin: '200px 0px' }, (viewer, entry) => {
      if (entry.isIntersecting && viewer.mount()) this.wake();
    });
    this.observe({ rootMargin: '1400px 0px' }, (viewer, entry) => {
      if (!entry.isIntersecting) viewer.unmount();
    });
    this.observe({ threshold: [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1] }, (viewer, entry) => {
      this.ratios.set(viewer, entry.isIntersecting ? entry.intersectionRatio : 0);
      this.wake();
    });
    for (const viewer of this.viewers) viewer.stage.addEventListener('focus', () => viewer.onInteract());
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private observe(options: IntersectionObserverInit, cb: (viewer: SpecimenViewer, entry: IntersectionObserverEntry) => void): void {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const viewer = this.byStage.get(entry.target);
        if (viewer) cb(viewer, entry);
      }
    }, options);
    for (const viewer of this.viewers) observer.observe(viewer.stage);
    this.observers.push(observer);
  }

  private readonly onVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else {
      this.wake();
    }
  };

  private active(): SpecimenViewer | null {
    const p = this.preferred;
    if (p && p.mounted && (this.ratios.get(p) ?? 0) > 0) return p;
    let best: SpecimenViewer | null = null;
    let bestRatio = 0;
    for (const viewer of this.viewers) {
      const ratio = this.ratios.get(viewer) ?? 0;
      if (viewer.mounted && ratio > bestRatio) {
        best = viewer;
        bestRatio = ratio;
      }
    }
    return best;
  }

  wake(): void {
    if (this.raf || document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    this.raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const active = this.active();
    for (const viewer of this.viewers) {
      if (!viewer.mounted) continue;
      if (viewer === active) viewer.frame(now, dt, true);
      else if (viewer.dirty) viewer.frame(now, 0, false);
    }
    const pending = this.viewers.some((v) => v.mounted && v.dirty);
    if (pending || (active && (!state.reducedMotion || active.busy))) this.wake();
  };
}
