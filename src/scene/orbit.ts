import type { PerspectiveCamera } from 'three';
import { clamp, damp } from './damp';
import type { SpecimenView } from './specimen-models';

const IDLE_SPEED = 0.16;
const IDLE_DELAY_MS = 2500;
const KEY_THETA = 0.26;
const KEY_PHI = 0.17;
const ZOOM_STEP = 0.87;

/**
 * Damped spherical orbit with drag inertia. The wheel is intentionally not used,
 * so page scrolling over a stage is never hijacked.
 */
export class OrbitRig {
  theta: number;
  phi: number;
  distance: number;
  private tTheta: number;
  private tPhi: number;
  private tDistance: number;
  private vTheta = 0;
  private vPhi = 0;
  private dragging = false;
  private pointerId = -1;
  private lastX = 0;
  private lastY = 0;
  private lastMove = 0;
  private lastInteraction = -Infinity;

  constructor(private readonly view: SpecimenView) {
    this.theta = this.tTheta = view.theta;
    this.phi = this.tPhi = view.phi;
    this.distance = this.tDistance = view.distance;
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  attach(el: HTMLElement, onInteract: () => void): () => void {
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || this.dragging) return;
      this.dragging = true;
      this.pointerId = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.lastMove = performance.now();
      this.vTheta = this.vPhi = 0;
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('is-dragging');
      this.touch();
      onInteract();
    };
    const move = (e: PointerEvent) => {
      if (!this.dragging || e.pointerId !== this.pointerId) return;
      const now = performance.now();
      const dt = Math.max(1, now - this.lastMove) / 1000;
      const dTheta = -(e.clientX - this.lastX) * 0.0085;
      const dPhi = -(e.clientY - this.lastY) * 0.0065;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.lastMove = now;
      this.tTheta += dTheta;
      this.tPhi = clamp(this.tPhi + dPhi, this.view.minPhi, this.view.maxPhi);
      this.vTheta = damp(this.vTheta, dTheta / dt, 18, dt);
      this.vPhi = damp(this.vPhi, dPhi / dt, 18, dt);
      this.touch();
      onInteract();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.dragging = false;
      this.pointerId = -1;
      if (performance.now() - this.lastMove > 80) this.vTheta = this.vPhi = 0;
      el.classList.remove('is-dragging');
      this.touch();
      onInteract();
    };
    const key = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      switch (e.key) {
        case 'ArrowLeft':
          this.tTheta -= KEY_THETA;
          break;
        case 'ArrowRight':
          this.tTheta += KEY_THETA;
          break;
        case 'ArrowUp':
          this.tPhi = clamp(this.tPhi - KEY_PHI, this.view.minPhi, this.view.maxPhi);
          break;
        case 'ArrowDown':
          this.tPhi = clamp(this.tPhi + KEY_PHI, this.view.minPhi, this.view.maxPhi);
          break;
        case '+':
        case '=':
          this.zoom(ZOOM_STEP);
          break;
        case '-':
        case '_':
          this.zoom(1 / ZOOM_STEP);
          break;
        case '0':
          this.reset();
          break;
        default:
          return;
      }
      e.preventDefault();
      this.vTheta = this.vPhi = 0;
      this.touch();
      onInteract();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('keydown', key);
      el.classList.remove('is-dragging');
    };
  }

  zoom(factor: number): void {
    this.tDistance = clamp(this.tDistance * factor, this.view.minDistance, this.view.maxDistance);
  }

  reset(): void {
    const turns = Math.round((this.tTheta - this.view.theta) / (Math.PI * 2));
    this.tTheta = this.view.theta + turns * Math.PI * 2;
    this.tPhi = this.view.phi;
    this.tDistance = this.view.distance;
    this.vTheta = this.vPhi = 0;
    this.touch();
  }

  private touch(): void {
    this.lastInteraction = performance.now();
  }

  /** Advances the rig; returns true while anything is still moving. */
  update(dt: number, now: number, idle: boolean, instant: boolean): boolean {
    if (!this.dragging && (this.vTheta !== 0 || this.vPhi !== 0)) {
      this.tTheta += this.vTheta * dt;
      this.tPhi = clamp(this.tPhi + this.vPhi * dt, this.view.minPhi, this.view.maxPhi);
      const decay = Math.exp(-3.5 * dt);
      this.vTheta *= decay;
      this.vPhi *= decay;
      if (Math.abs(this.vTheta) < 1e-3 && Math.abs(this.vPhi) < 1e-3) this.vTheta = this.vPhi = 0;
    }
    const spinning = idle && !this.dragging && now - this.lastInteraction > IDLE_DELAY_MS;
    if (spinning) this.tTheta += IDLE_SPEED * dt;

    if (instant) {
      this.theta = this.tTheta;
      this.phi = this.tPhi;
      this.distance = this.tDistance;
    } else {
      this.theta = damp(this.theta, this.tTheta, 9, dt);
      this.phi = damp(this.phi, this.tPhi, 9, dt);
      this.distance = damp(this.distance, this.tDistance, 7, dt);
    }
    const settling =
      Math.abs(this.theta - this.tTheta) > 1e-4 ||
      Math.abs(this.phi - this.tPhi) > 1e-4 ||
      Math.abs(this.distance - this.tDistance) > 1e-4;
    return spinning || settling || this.vTheta !== 0 || this.vPhi !== 0;
  }

  apply(camera: PerspectiveCamera): void {
    const t = this.view.target;
    const s = Math.sin(this.phi);
    camera.position.set(
      t.x + this.distance * s * Math.sin(this.theta),
      t.y + this.distance * Math.cos(this.phi),
      t.z + this.distance * s * Math.cos(this.theta),
    );
    camera.lookAt(t);
  }
}
