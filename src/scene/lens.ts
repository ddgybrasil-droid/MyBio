import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
  type BufferGeometry,
  type Texture,
} from 'three';
import { state, type SectionId, type SocialId } from '../state';
import { ANCHOR_IDS, AnchorTracker, SectionWeights, type AnchorId, type AnchorRect } from './anchors';
import { BENCH_W, Bench, LamellaShadows, Rails } from './backdrop';
import { DEG, clamp, damp, dampArray, easeOutCubic } from './damp';
import { createGlassMaterial, createRoomEnvironment, useHighlightToneMapping } from './glass';
import { LAMELLA_COUNT, LAMELLA_SPECS, createLamellaGeometries } from './lamellae';
import { tokenColor, tokenHex } from './palette';
import {
  G,
  STRIDE,
  aboutPose,
  addPose,
  clearPose,
  contactPose,
  createPose,
  heroPose,
  labPose,
} from './poses';

/** World units per CSS pixel on the lens plane (z = 0). */
const WPP = 0.01;
const FOV = 24;
const BENCH_DEPTH = 2.6;
const RIPPLE_MS = 700;
const BASE_DISPERSION = 0.35;
/** Transmission thickness in lens radii; the refracted offset scales with it. */
const THICKNESS = 5;
/** Path lengths (in THICKNESS units) over which light takes on one full attenuation tint. */
const TINT_DEPTH = 0.3;

/** Lens radius in CSS px for an anchor rect, per section composition. */
const FIT: Record<AnchorId, (r: AnchorRect) => number> = {
  hero: (r) => Math.min(r.w, r.h) * 0.46,
  about: (r) => Math.min(r.w / 3.5, r.h / 2.2),
  // Each louvre group spans ~1.05 radii: keep it inside the lab's widened side padding (main.css).
  lab: (r) => Math.min(r.h * 0.46, Math.max(r.w * 0.08, 48)),
  contact: (r) => Math.min(r.w * 0.27, r.h * 0.3),
};

interface Frame {
  present: boolean;
  x: number;
  y: number;
  s: number;
  /** Anchor half extents in lens units (for the lab shutters). */
  hw: number;
  hh: number;
}

const newFrame = (): Frame => ({ present: false, x: 0, y: 0, s: 1, hw: 1, hh: 1 });

const SOCIAL_ORDER: Record<SocialId, number> = { discord: -1, telegram: 0, tiktok: 1 };

export function initLensScene(canvas: HTMLCanvasElement): { dispose(): void } {
  const lite = state.tier < 2;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      stencil: false,
      powerPreference: lite ? 'default' : 'high-performance',
    });
  } catch {
    return { dispose() {} };
  }

  const background = tokenColor('canvas');
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(background, 1);

  const scene = new Scene();
  let env: Texture = createRoomEnvironment(renderer);
  scene.environment = env;
  scene.environmentIntensity = 0.9;

  const camera = new PerspectiveCamera(FOV, 1, 0.5, 400);

  const key = new DirectionalLight(0xffffff, 1.4);
  key.position.set(-3, 5, 7);
  const rim = new DirectionalLight(0xf4f6f2, 1.1);
  rim.position.set(5, 2, -6);
  scene.add(key, rim);

  const glass = createGlassMaterial({
    thickness: THICKNESS,
    ior: 1.5,
    dispersion: lite ? 0 : BASE_DISPERSION,
    attenuation: '#c9d0cc',
    envMapIntensity: 1,
    clearcoat: 0.5,
  });
  useHighlightToneMapping(glass, 1.15, { tint: new Color(0.03, 0.036, 0.034), strength: 0.9, power: 3 });
  const geometries: BufferGeometry[] = createLamellaGeometries(lite ? 'low' : 'high');
  const lens = new Group();
  const lamellae = geometries.map((geometry) => {
    const mesh = new Mesh(geometry, glass);
    lens.add(mesh);
    return mesh;
  });
  scene.add(lens);

  const bench = new Bench(background, tokenHex('canvas'), tokenHex('ink'), lite ? 1280 : 2048);
  scene.add(bench.mesh);
  const shadows = new LamellaShadows(LAMELLA_COUNT + 1, new Color(0.62, 0.66, 0.64));
  const ground = shadows.meshes[LAMELLA_COUNT];
  const rails = new Rails();
  for (const mesh of rails.meshes) scene.add(mesh);
  for (const mesh of shadows.meshes) scene.add(mesh);

  if (document.fonts) {
    Promise.all([
      document.fonts.load('620 100px "Onest Variable"'),
      document.fonts.load('500 20px "IBM Plex Mono"'),
    ])
      .then(() => {
        bench.redraw();
        forceRender = true;
      })
      .catch(() => undefined);
  }

  const anchors = new AnchorTracker(document);
  const sections = new SectionWeights();
  const frames = {} as Record<AnchorId, Frame>;
  for (const id of ANCHOR_IDS) frames[id] = newFrame();
  const frame = newFrame();

  const scratch = createPose();
  const target = createPose();
  const current = createPose();
  const display = createPose();
  const lastRendered = new Float32Array(display.lam.length + display.group.length + 4);

  let width = 1;
  let height = 1;
  let viewportH = window.innerHeight;
  const coarse = matchMedia('(pointer: coarse)').matches;

  function applySize(): void {
    const w = Math.max(1, document.documentElement.clientWidth || window.innerWidth);
    let h = Math.max(1, window.innerHeight);
    // Mobile toolbars shrink innerHeight while scrolling; keep the large viewport to avoid resize thrash.
    if (coarse && w === width && h < height && height - h < 200) h = height;
    viewportH = window.innerHeight;
    if (w === width && h === height) return;
    width = w;
    height = h;
    const dpr = Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 1.75);
    renderer.setPixelRatio(dpr);
    // Keep the refracted image at roughly one sample per CSS px (hairlines must stay crisp through glass).
    renderer.transmissionResolutionScale = Math.min(lite ? 0.6 : 1, (lite ? 0.8 : 1.3) / dpr);
    renderer.setSize(w, h, false);
    if (coarse) canvas.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.position.set(0, 0, (h * WPP) / 2 / Math.tan((FOV / 2) * DEG));
    camera.far = camera.position.z * 4;
    camera.updateProjectionMatrix();
    sections.refresh();
    // A resized opaque canvas shows black until drawn; paint the page colour right away.
    renderer.clear();
    forceRender = true;
  }

  let resizeTimer = 0;
  const onResize = (): void => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(applySize, 150);
  };

  let raf = 0;
  let lastNow = performance.now();
  const startNow = lastNow;
  let hasPose = false;
  let wasDark = false;
  let wasOffscreen = false;
  let forceRender = true;
  let lost = false;
  let tiltX = 0;
  let tiltY = 0;
  let velocity = 0;
  let socialAmount = 0;
  let socialDirX = 0;
  let socialDirY = 0;
  let socialTarget: SocialId | null = null;
  let socialTargetX = 0;
  let socialTargetY = 0;
  let lastBurst = state.burst.t;
  let rippleStart = -Infinity;
  let rippleX = 0;
  let rippleY = 0;

  function computeFrames(): boolean {
    anchors.read();
    let any = false;
    for (const id of ANCHOR_IDS) {
      const r = anchors.rects[id];
      const f = frames[id];
      f.present = r.present;
      if (!r.present) continue;
      any = true;
      const radius = Math.max(8, FIT[id](r));
      f.x = (r.cx - width / 2) * WPP;
      f.y = -(r.cy - height / 2) * WPP;
      f.s = radius * WPP;
      f.hw = r.w / 2 / radius;
      f.hh = r.h / 2 / radius;
    }
    return any;
  }

  function sectionWeight(id: AnchorId): number {
    return frames[id].present ? sections.weights[id as SectionId] : 0;
  }

  function blendTargets(): void {
    sections.update(state.section, viewportH);
    let total = 0;
    for (const id of ANCHOR_IDS) total += sectionWeight(id);
    const fallback = total < 1e-4 ? ANCHOR_IDS.find((id) => frames[id].present) : undefined;

    frame.x = frame.y = frame.s = frame.hw = frame.hh = 0;
    clearPose(target);
    for (const id of ANCHOR_IDS) {
      const w = fallback ? (id === fallback ? 1 : 0) : sectionWeight(id) / total;
      if (w <= 0) continue;
      const f = frames[id];
      frame.x += f.x * w;
      frame.y += f.y * w;
      frame.s += f.s * w;
      frame.hw += f.hw * w;
      frame.hh += f.hh * w;
      switch (id) {
        case 'hero': {
          let turn = 0;
          if (!state.reducedMotion) {
            const hs = sections.height('hero');
            const p0 = hs > 0 ? viewportH / (hs + viewportH) : 0.5;
            turn = clamp((state.section.hero - p0) / Math.max(1e-3, 1 - p0), 0, 1);
          }
          heroPose(scratch, turn);
          break;
        }
        case 'about':
          aboutPose(scratch);
          break;
        case 'lab':
          // Below 900px the lab keeps its normal gutter, so the louvres bleed off the edges.
          labPose(scratch, f.hw, f.hh, width < 900 ? 0.65 : 0);
          break;
        case 'contact':
          contactPose(scratch);
          break;
      }
      addPose(target, scratch, w);
    }
  }

  function updateSocialTarget(): void {
    const social = state.activeSocial;
    if (social === socialTarget) return;
    socialTarget = social;
    if (!social) return;
    const el = document.querySelector(`[data-social="${social}"], [data-social-trigger="${social}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      const px = ((r.left + r.width / 2 - width / 2) * WPP - frame.x) / Math.max(frame.s, 1e-3);
      const py = (-(r.top + r.height / 2 - height / 2) * WPP - frame.y) / Math.max(frame.s, 1e-3);
      socialTargetX = clamp(px, -1, 1);
      socialTargetY = clamp(py, -1, 1);
    } else {
      socialTargetX = SOCIAL_ORDER[social];
      socialTargetY = 0;
    }
  }

  /** Adds the time-based layers (intro, idle, pointer, velocity, social, ripple) on top of the damped pose. */
  function composeDisplay(now: number, dt: number): number {
    display.lam.set(current.lam);
    display.group.set(current.group);
    const lam = display.lam;
    const g = display.group;
    const reduced = state.reducedMotion;
    const contactW = sectionWeight('contact');

    updateSocialTarget();
    const socialOn = state.activeSocial ? 1 : 0;
    if (reduced) {
      socialAmount = socialOn;
      socialDirX = socialTargetX;
      socialDirY = socialTargetY;
    } else {
      socialAmount = damp(socialAmount, socialOn, 5, dt);
      socialDirX = damp(socialDirX, socialTargetX, 6, dt);
      socialDirY = damp(socialDirY, socialTargetY, 6, dt);
    }
    const fan = socialAmount * contactW;
    if (fan > 1e-4) {
      g[G.ry] += socialDirX * 12 * DEG * fan;
      g[G.rx] -= socialDirY * 6 * DEG * fan;
      for (let i = 0; i < LAMELLA_COUNT; i++) {
        const o = i * STRIDE;
        lam[o] *= 1 + 0.12 * fan;
        lam[o + 4] += (i - 3) * 6 * DEG * fan;
      }
    }

    let rippleEnv = 0;
    if (!reduced) {
      const t = (now - startNow) / 1000;
      for (let i = 0; i < LAMELLA_COUNT; i++) {
        const o = i * STRIDE;
        const intro = easeOutCubic((t - 0.1 - i * 0.07) / 0.7);
        if (intro < 1) {
          const k = 1 - intro;
          lam[o + 1] -= k * 2.8;
          lam[o + 2] += k * 0.4;
          lam[o + 5] += k * (i - 3) * 5 * DEG;
        }
        lam[o + 1] += Math.sin(t * 0.6 + i * 1.3) * 0.006;
        lam[o + 2] += Math.sin(t * 0.9 + i * 0.8) * 0.012;
      }
      g[G.rx] += Math.sin(t * 0.7) * 0.5 * DEG;

      tiltX = damp(tiltX, -state.pointer.y * 4 * DEG, 4, dt);
      tiltY = damp(tiltY, state.pointer.x * 4 * DEG, 4, dt);
      g[G.rx] += tiltX;
      g[G.ry] += tiltY;

      velocity = damp(velocity, clamp(state.velocity / 45, -1, 1), 6, dt);
      if (Math.abs(velocity) > 1e-4) {
        for (let i = 0; i < LAMELLA_COUNT; i++) {
          const o = i * STRIDE;
          lam[o] *= 1 + 0.06 * Math.abs(velocity);
          lam[o + 1] += (i - 3) * 0.035 * velocity;
        }
      }

      if (state.burst.t !== lastBurst) {
        lastBurst = state.burst.t;
        if (now - state.burst.t < RIPPLE_MS) {
          rippleStart = state.burst.t;
          const clientX = ((state.burst.x + 1) / 2) * window.innerWidth;
          const clientY = ((1 - state.burst.y) / 2) * window.innerHeight;
          rippleX = ((clientX - width / 2) * WPP - frame.x) / Math.max(frame.s, 1e-3);
          rippleY = (-(clientY - height / 2) * WPP - frame.y) / Math.max(frame.s, 1e-3);
        }
      }
      const rt = (now - rippleStart) / RIPPLE_MS;
      if (rt >= 0 && rt < 1) {
        rippleEnv = (1 - rt) * (1 - rt);
        const front = rt * 3.2;
        for (let i = 0; i < LAMELLA_COUNT; i++) {
          const o = i * STRIDE;
          const dx = lam[o] - rippleX;
          const d = Math.hypot(dx, lam[o + 1] - rippleY);
          const wave = Math.exp(-(((d - front) / 0.45) ** 2)) * rippleEnv;
          lam[o + 2] += 0.24 * wave;
          lam[o + 5] += 0.06 * wave * Math.sign(dx || 1);
          lam[o + 6] *= 1 + 0.07 * wave;
          lam[o + 7] *= 1 + 0.07 * wave;
          lam[o + 8] *= 1 + 0.07 * wave;
        }
      }
    }
    return rippleEnv;
  }

  function applyDisplay(rippleEnv: number): void {
    const g = display.group;
    const s = frame.s * g[G.scale];
    lens.position.set(frame.x + g[G.ox] * frame.s, frame.y + g[G.oy] * frame.s, 0);
    lens.rotation.set(g[G.rx], g[G.ry], g[G.rz]);
    lens.scale.setScalar(s);
    for (let i = 0; i < LAMELLA_COUNT; i++) {
      const o = i * STRIDE;
      const l = display.lam;
      const mesh = lamellae[i];
      mesh.position.set(l[o], l[o + 1], l[o + 2]);
      mesh.rotation.set(l[o + 3], l[o + 4], l[o + 5]);
      mesh.scale.set(l[o + 6], l[o + 7], l[o + 8]);
    }
    lens.updateMatrixWorld(true);

    const camZ = camera.position.z;
    const zb = -BENCH_DEPTH * frame.s;
    const k = (camZ - zb) / camZ;
    bench.mesh.position.set(frame.x * k, frame.y * k, zb);
    bench.mesh.scale.setScalar(frame.s * k);
    bench.strength = clamp(g[G.bench], 0, 1);

    for (let i = 0; i < LAMELLA_COUNT; i++) {
      const spec = LAMELLA_SPECS[i];
      const o = i * STRIDE;
      const l = display.lam;
      const e = lamellae[i].matrixWorld.elements;
      const px = e[12];
      const py = e[13];
      const pz = e[14];
      const t = (camZ - zb) / Math.max(1e-3, camZ - pz);
      const gap = Math.max(0, (pz - zb) / Math.max(frame.s, 1e-3));
      const yaw = g[G.ry] + l[o + 4];
      const footprint = (Math.abs(Math.cos(yaw)) * spec.width + Math.abs(Math.sin(yaw)) * spec.depth * 1.6) * l[o + 6];
      const blur = 1 + 0.04 * gap;
      const shadow = shadows.meshes[i];
      shadow.position.set(px * t + 0.035 * gap * s, py * t - 0.06 * gap * s, zb);
      shadow.rotation.set(0, 0, g[G.rz] + l[o + 5]);
      shadow.scale.set(footprint * 1.7 * blur * s * t, spec.height * l[o + 7] * 1.3 * blur * s * t, 1);
      shadow.material.uniforms.strength.value = (clamp(g[G.shadow], 0, 1) * 0.34) / (1 + 0.2 * gap);
    }

    // Soft pool under the optic, as if it stood just in front of the card.
    const groundT = (camZ - zb) / camZ;
    ground.position.set((lens.position.x + 0.12 * s) * groundT, (lens.position.y - 1.04 * s) * groundT, zb);
    ground.rotation.set(0, 0, g[G.rz] * 0.5);
    ground.scale.set(2.1 * s * groundT, 0.3 * s * groundT, 1);
    ground.material.uniforms.strength.value = clamp(g[G.ground], 0, 1) * 0.6;

    const railStrength = clamp(g[G.rails], 0, 1);
    if (railStrength > 1e-3 || rails.meshes[0].visible) {
      const unit = frame.s * k;
      for (let side = 0; side < 2; side++) {
        const from = side === 0 ? 0 : 4;
        const to = side === 0 ? 4 : LAMELLA_COUNT;
        let sx = 0;
        for (let i = from; i < to; i++) sx += lamellae[i].matrixWorld.elements[12];
        sx /= to - from;
        const t = (camZ - zb) / camZ;
        rails.place(side, sx * t, frame.y * k, zb, unit * 1.1, unit * frame.hh * 1.9, unit, railStrength);
      }
    }

    // Keep the tint independent of the on-screen size (three scales the path by the model scale).
    glass.attenuationDistance = (THICKNESS * s) / TINT_DEPTH;

    if (!lite) glass.dispersion = BASE_DISPERSION + 3 * rippleEnv;
  }

  function changedSinceRender(): boolean {
    let i = 0;
    let delta = 0;
    const push = (v: number) => {
      delta = Math.max(delta, Math.abs(lastRendered[i] - v));
      lastRendered[i++] = v;
    };
    for (const v of display.lam) push(v);
    for (const v of display.group) push(v);
    push(frame.x);
    push(frame.y);
    push(frame.s);
    push(glass.dispersion);
    return delta > 1e-5;
  }

  function isOffscreen(): boolean {
    const cx = frame.x / WPP + width / 2;
    const cy = height / 2 - frame.y / WPP;
    const r = ((frame.s * BENCH_W) / 2 / WPP) * 1.1;
    return cx + r < 0 || cx - r > width || cy + r < 0 || cy - r > height;
  }

  function tick(now: number): void {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    if (lost) return;
    if (state.dark >= 0.999) {
      wasDark = true;
      return;
    }
    if (!computeFrames()) {
      if (forceRender) renderer.clear();
      forceRender = false;
      return;
    }
    blendTargets();

    if (!hasPose || wasDark || state.reducedMotion) {
      current.lam.set(target.lam);
      current.group.set(target.group);
      hasPose = true;
    } else {
      dampArray(current.lam, target.lam, 7, dt);
      dampArray(current.group, target.group, 7, dt);
    }
    if (wasDark) forceRender = true;
    wasDark = false;

    const rippleEnv = composeDisplay(now, dt);
    applyDisplay(rippleEnv);

    const offscreen = isOffscreen();
    const changed = changedSinceRender();
    if (!forceRender && ((offscreen && wasOffscreen) || !changed)) return;
    wasOffscreen = offscreen;
    forceRender = false;
    renderer.render(scene, camera);
  }

  function start(): void {
    if (raf || document.hidden) return;
    lastNow = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stop(): void {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  const onVisibility = (): void => {
    if (document.hidden) stop();
    else {
      forceRender = true;
      start();
    }
  };

  const onLost = (event: Event): void => {
    event.preventDefault();
    lost = true;
  };

  const onRestored = (): void => {
    env.dispose();
    env = createRoomEnvironment(renderer);
    scene.environment = env;
    lost = false;
    forceRender = true;
  };

  applySize();
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  start();

  return {
    dispose() {
      stop();
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      sections.dispose();
      for (const geometry of geometries) geometry.dispose();
      glass.dispose();
      bench.dispose();
      shadows.dispose();
      rails.dispose();
      env.dispose();
      renderer.dispose();
    },
  };
}
