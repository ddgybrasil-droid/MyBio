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
import { DEG, clamp, damp, dampArray, easeOutCubic, smoothstep } from './damp';
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
const BASE_DISPERSION = 0.22;
/** Transmission thickness in lens radii; the refracted offset scales with it. */
const THICKNESS = 7.4;
/** Path lengths (in THICKNESS units) over which light takes on one full attenuation tint. */
const TINT_DEPTH = 0.28;

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
  scene.environmentIntensity = 0.72;

  const camera = new PerspectiveCamera(FOV, 1, 0.5, 400);

  // Soft key + cool fill + crisp rim: edges catch light; faces stay see-through.
  const key = new DirectionalLight(0xfff6ee, 0.55);
  key.position.set(-3.2, 6.2, 5.5);
  const fill = new DirectionalLight(0xdde6ea, 0.22);
  fill.position.set(1.8, 0.6, 6.5);
  const rim = new DirectionalLight(0xf5faf7, 2.1);
  rim.position.set(6.2, 2.4, -4.8);
  scene.add(key, fill, rim);

  const glass = createGlassMaterial({
    thickness: THICKNESS,
    ior: 1.5,
    roughness: lite ? 0.04 : 0.0,
    dispersion: lite ? 0 : BASE_DISPERSION,
    attenuation: '#f3f7f4',
    envMapIntensity: lite ? 0.55 : 0.68,
    clearcoat: 0.55,
  });
  useHighlightToneMapping(glass, 0.95, { tint: new Color(0.04, 0.048, 0.045), strength: 0.42, power: 2.9 });
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
  const lastRendered = new Float32Array(display.lam.length + display.group.length + 10);

  let width = 1;
  let height = 1;
  let cameraZBase = 1;
  let viewportH = window.innerHeight;
  /** 1 on a single anchor; dips toward 0 while hero and about would otherwise slide into each other. */
  let anchorPresence = 1;
  let dominantAnchor: AnchorId | null = null;
  /** Center-stage chapter (hero pin through the Work dock). Lab and contact opt out. */
  let chapter = false;
  /** 0 while Work is still below the fold, 1 once the optic must be gone. */
  let exitT = 0;
  let opticDissolve = 0;
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
    renderer.transmissionResolutionScale = Math.min(lite ? 0.75 : 1.25, (lite ? 1 : 1.6) / dpr);
    renderer.setSize(w, h, false);
    if (coarse) canvas.style.height = `${h}px`;
    camera.aspect = w / h;
    cameraZBase = (h * WPP) / 2 / Math.tan((FOV / 2) * DEG);
    camera.position.set(0, 0, cameraZBase);
    camera.far = cameraZBase * 4;
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
  let darkSmooth = 0;
  let wasOffscreen = false;
  let forceRender = true;
  let lost = false;
  let tiltX = 0;
  let tiltY = 0;
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
    const weights = {} as Record<AnchorId, number>;
    let total = 0;
    for (const id of ANCHOR_IDS) {
      weights[id] = sectionWeight(id);
      total += weights[id];
    }
    const fallback = total < 1e-4 ? ANCHOR_IDS.find((id) => frames[id].present) : undefined;
    if (fallback) {
      for (const id of ANCHOR_IDS) weights[id] = id === fallback ? 1 : 0;
      total = 1;
    }

    // Hero→about must not lerp the optic across the viewport (that reads as a fly-over).
    // Commit to one anchor and dip the scale at the swap so the handoff is a dissolve in place.
    anchorPresence = 1;
    let dominantNow: AnchorId | null = null;
    if (!fallback && weights.hero > 0.02 && weights.about > 0.02) {
      const share = weights.about / (weights.hero + weights.about);
      const edge = Math.abs(share - 0.5) * 2;
      anchorPresence = 0.08 + 0.92 * smoothstep(0, 0.78, edge);
      if (share >= 0.5) {
        weights.hero = 0;
        dominantNow = 'about';
      } else {
        weights.about = 0;
        dominantNow = 'hero';
      }
      total = 0;
      for (const id of ANCHOR_IDS) total += weights[id];
    } else if (!fallback) {
      let best: AnchorId = 'hero';
      let bestW = -1;
      for (const id of ANCHOR_IDS) {
        if (weights[id] > bestW) {
          best = id;
          bestW = weights[id];
        }
      }
      dominantNow = bestW > 0 ? best : null;
    } else {
      dominantNow = fallback ?? null;
    }

    frame.x = frame.y = frame.s = frame.hw = frame.hh = 0;
    clearPose(target);
    if (total < 1e-4) {
      chapter = false;
      exitT = 0;
      return;
    }

    for (const id of ANCHOR_IDS) {
      const w = weights[id] / total;
      if (w <= 0) continue;
      const f = frames[id];
      frame.x += f.x * w;
      frame.y += f.y * w;
      frame.s += f.s * w;
      frame.hw += f.hw * w;
      frame.hh += f.hh * w;
      switch (id) {
        case 'hero': {
          const story = state.reducedMotion ? 0 : state.story;
          heroPose(scratch, story);
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

    const crossing =
      dominantNow !== dominantAnchor &&
      (dominantNow === 'hero' || dominantNow === 'about' || dominantAnchor === 'hero' || dominantAnchor === 'about');
    if (crossing && !inChapter()) {
      current.lam.set(target.lam);
      current.group.set(target.group);
    }
    dominantAnchor = dominantNow;
    lockChapterFrame();
  }

  /** Gap window shared with heroPose: snappy open, long hold, compress. */
  function separationAmount(story: number): number {
    const t = clamp(story, 0, 1);
    const rise = clamp((t - 0.04) / 0.22, 0, 1);
    return rise * (1 - smoothstep(0.84, 0.99, t));
  }

  function inChapter(): boolean {
    if (state.reducedMotion) return false;
    if (sectionWeight('lab') >= 0.25 || sectionWeight('contact') >= 0.2) return false;
    // Keep centre-lock for the whole scrub including story===1 settle, then through
    // About + handoff so pin release never drops the optic into a hard cut.
    if (state.story > 0.001 && (sectionWeight('hero') > 0.01 || sectionWeight('about') > 0.01)) return true;
    if (sectionWeight('hero') > 0.02 || sectionWeight('about') > 0.02) return true;
    return state.handoff > 0.02 && state.handoff < 0.98;
  }

  /**
   * Work approach: 0 while chamber is still below the fold, 1 when it has almost
   * claimed the viewport — long enough for an in-place match-cut, not a fly-away.
   */
  function readExit(): number {
    const work = document.getElementById('work');
    if (!work) return 0;
    const top = work.getBoundingClientRect().top;
    // Start earlier so dock/dissolve overlaps the cream→void melt.
    const start = height * 1.6;
    const end = height * 0.22;
    return clamp((start - top) / Math.max(1, start - end), 0, 1);
  }

  /**
   * Hold the stack at viewport centre for the scrub, then shrink it in place into
   * the first specimen iris (All-Star burger→content match-cut). Avoid early sink
   * to the bottom edge — that reads as a hard cut before Work owns the frame.
   */
  function lockChapterFrame(): void {
    chapter = inChapter();
    exitT = chapter ? readExit() : 0;
    if (!chapter || frame.s <= 0) return;

    const mobile = width < 900;
    // Outer slab sits ~1.7 radii off centre when the gap is open; keep that inside the frame.
    const stageS = Math.min(width, height) * (mobile ? 0.33 : 0.26) * WPP;
    const stageY = height * 0.015 * WPP;

    // Default dock: shrink toward optical centre (same place the iris blooms).
    let dockX = 0;
    let dockY = stageY - height * 0.03 * WPP;
    let dockS = Math.min(width, height) * (mobile ? 0.12 : 0.09) * WPP;

    const specimen = document.querySelector('[data-specimen="lens"]');
    const work = document.getElementById('work');
    const workTop = work ? work.getBoundingClientRect().top : height;
    if (specimen && exitT > 0.28) {
      const r = specimen.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const inFrame =
        r.width > 32 &&
        r.height > 32 &&
        cy > height * 0.18 &&
        cy < height * 0.96 &&
        r.top > workTop - height * 0.1;
      if (inFrame) {
        const commit = smoothstep(0.28, 0.86, exitT);
        dockX = (cx - width / 2) * WPP * commit;
        dockY = stageY + (-(cy - height / 2) * WPP - stageY) * commit;
        dockS = stageS + (Math.min(r.width, r.height) * 0.24 * WPP - stageS) * commit;
      }
    }

    // Early exit: scale in place. Late exit: commit toward specimen.
    const u = exitT * exitT * (3 - 2 * exitT);
    frame.present = true;
    frame.x = dockX * u;
    frame.y = stageY + (dockY - stageY) * u;
    frame.s = stageS + (dockS - stageS) * u;
    frame.hw = 1;
    frame.hh = 1;
  }

  /** True when rods would still read in the cream above a Work heading that is already in frame. */
  function headingOwnsFrame(): boolean {
    if (!chapter && state.handoff < 0.12) return false;
    const heading = document.querySelector('#work .work__heading');
    const work = document.getElementById('work');
    if (!heading || !work) return false;
    const hr = heading.getBoundingClientRect();
    if (hr.bottom < height * 0.04 || hr.top > height * 0.8) return false;
    const wr = work.getBoundingClientRect();
    const cx = frame.x / WPP + width / 2;
    const cy = height / 2 - frame.y / WPP;
    const rad = Math.max(28, (frame.s / WPP) * 1.25);
    const centerInHeading = cx > hr.left && cx < hr.right && cy > hr.top && cy < hr.bottom;
    const sticksIntoCream = cy - rad < wr.top - 2;
    return centerInHeading || sticksIntoCream;
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
      const storyW = clamp(state.story, 0, 1);
      // Idle drift and scroll-velocity smear fight the scrub. Hold still while the chapter plays.
      const idle = storyW < 0.035 && state.handoff < 0.04 ? 1 : 0;
      for (let i = 0; i < LAMELLA_COUNT; i++) {
        const o = i * STRIDE;
        const intro = easeOutCubic((t - 0.12 - i * 0.055) / 0.85);
        if (intro < 1 && storyW < 0.02) {
          const k = 1 - intro;
          lam[o + 1] -= k * 1.6;
          lam[o + 2] += k * 0.22;
          lam[o + 5] += k * (i - 3) * 2.4 * DEG;
        }
        lam[o + 1] += Math.sin(t * 0.45 + i * 1.1) * 0.0022 * idle;
        lam[o + 2] += Math.sin(t * 0.55 + i * 0.7) * 0.004 * idle;
      }
      g[G.rx] += Math.sin(t * 0.42) * 0.22 * DEG * idle;

      const tiltGain = storyW > 0.04 || state.handoff > 0.04 ? 0.22 : 1;
      tiltX = damp(tiltX, -state.pointer.y * 2.4 * DEG * tiltGain, 3.2, dt);
      tiltY = damp(tiltY, state.pointer.x * 2.4 * DEG * tiltGain, 3.2, dt);
      g[G.rx] += tiltX;
      g[G.ry] += tiltY;

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
    const storyT = state.reducedMotion ? 0 : clamp(state.story, 0, 1);
    // Camera is secondary: a short dolly only while the slabs are separated, to catch refraction.
    const dolly = 1 - 0.06 * separationAmount(storyT);
    camera.position.z = cameraZBase * dolly;

    // Hold optic through melt; dissolve only as iris claims the centre (no empty dark beat).
    let dissolve = chapter ? smoothstep(0.58, 0.96, Math.max(exitT, state.handoff * 0.85)) : 0;
    if (!chapter && state.handoff > 0.6) dissolve = 1;
    if (headingOwnsFrame() && exitT > 0.68) dissolve = Math.max(dissolve, smoothstep(0.68, 0.92, exitT));
    opticDissolve = dissolve;

    const presence = chapter ? 1 : anchorPresence;
    const s = frame.s * g[G.scale] * Math.max(0.04, presence);
    lens.position.set(frame.x + g[G.ox] * frame.s, frame.y + g[G.oy] * frame.s, 0);
    lens.rotation.set(g[G.rx], g[G.ry], g[G.rz]);
    lens.scale.setScalar(s);
    const showOptic = dissolve < 0.96 && presence > 0.05;
    lens.visible = showOptic;
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
    const benchFade = showOptic ? 1 - smoothstep(0, 0.4, chapter ? exitT : 0) : 0;
    bench.strength = clamp(g[G.bench], 0, 1) * benchFade;

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
      shadow.material.uniforms.strength.value = showOptic ? (clamp(g[G.shadow], 0, 1) * 0.34) / (1 + 0.2 * gap) : 0;
    }

    // Soft pool under the optic, as if it stood just in front of the card.
    const groundT = (camZ - zb) / camZ;
    ground.position.set((lens.position.x + 0.12 * s) * groundT, (lens.position.y - 1.04 * s) * groundT, zb);
    ground.rotation.set(0, 0, g[G.rz] * 0.5);
    ground.scale.set(2.1 * s * groundT, 0.3 * s * groundT, 1);
    ground.material.uniforms.strength.value = showOptic ? clamp(g[G.ground], 0, 1) * 0.6 : 0;

    const railStrength = showOptic ? clamp(g[G.rails], 0, 1) : 0;
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

    if (!lite) glass.dispersion = BASE_DISPERSION + 2.2 * rippleEnv;
    // Opacity only at the tail of the exit. A long fade milks transmission and ghosts rods
    // over the heading; the dock scale does the handoff, then the mesh hard-hides.
    if (dissolve > 0.6) {
      const fade = smoothstep(0.6, 0.96, dissolve);
      glass.transparent = true;
      glass.opacity = 1 - fade;
      glass.depthWrite = fade < 0.3;
    } else {
      glass.transparent = false;
      glass.opacity = 1;
      glass.depthWrite = true;
    }
    bench.mesh.visible = showOptic && bench.strength > 0.02;
    scene.environmentIntensity = 0.72 * (showOptic ? 1 : 0.85);
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
    push(glass.opacity);
    push(state.handoff);
    push(anchorPresence);
    push(exitT);
    push(opticDissolve);
    push(camera.position.z);
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
    darkSmooth = state.reducedMotion ? state.dark : damp(darkSmooth, state.dark, 6.5, dt);
    // Clear only once the chamber owns the view. Handoff alone must keep rendering
    // so the dock can finish before the heading is on screen.
    if (darkSmooth >= 0.992 && state.handoff >= 0.98) {
      if (!wasDark) {
        renderer.setClearColor(background, 1);
        renderer.clear();
        lens.visible = false;
      }
      wasDark = true;
      forceRender = false;
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
      // Near-snap pose follow while scrubbing — floaty damp was the lag vs All-Star lock.
      const tracking = chapter && state.story > 0.02 && state.story < 0.98 && sectionWeight('hero') > 0.35;
      const rate = tracking ? 22 : 14;
      dampArray(current.lam, target.lam, rate, dt);
      dampArray(current.group, target.group, rate, dt);
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
