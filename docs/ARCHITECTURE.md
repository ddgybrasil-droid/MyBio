# ASCEND / S7 — architecture

Static site: Vite 7, TypeScript 5.9, Three.js 0.186, GSAP 3.15 (ScrollTrigger), Lenis 1.3. No framework. Copy is in Russian. The visual system is in `.superdesign/design-system.md`; tokens live in `src/styles/tokens.css` and must be used instead of hard-coded colors.

## Principles

1. Semantic HTML is the source of truth. Every link, handle, and project fact is DOM content. WebGL is decorative (`aria-hidden`) or duplicated in DOM.
2. Native scroll. Lenis smooths wheel input on fine pointers only; it is disabled for reduced motion and touch.
3. Scroll/pointer write plain numbers into the shared mutable `state` (`src/state.ts`). Render loops read it every frame. No per-frame DOM writes from WebGL code, no React-style state.
4. Capability tiers (`state.tier`, also `html[data-tier]`): 0 = no WebGL (posters + CSS), 1 = lite (DPR ≤ 1.25, cheaper materials, no hover previews), 2 = full (DPR ≤ 1.75). `?tier=0|1|2` forces a tier.
5. Reduced motion (`state.reducedMotion`, `html.reduced-motion`): no scrubbed camera/lens motion, no parallax or springs; fades ≤ 150 ms; the lens renders as a static composition.
6. Every render loop pauses when its canvas is offscreen or the tab is hidden.

## Boot order (`src/main.ts`, owned by the integrator)

1. Fonts and CSS, tier + motion detection, `initUI()` synchronously.
2. On idle: dynamic `import('./scene/lens')` → `initLensScene(canvas)`, `import('./scene/specimens')` → `initSpecimens(document)` (tier ≥ 1 only), `import('./lab')` → `initLab(document)` (always).
3. `html.webgl-ready` is added once the WebGL modules are initialised.

## Module ownership and public API

| Area | Files | Exports |
|---|---|---|
| Page layout, CSS, scroll choreography, social interactions | `index.html`, `src/styles/main.css`, `src/ui/**` | `initUI(): void` from `src/ui/index.ts` |
| S7 lens scene (fixed full-page canvas) | `src/scene/lens.ts`, `src/scene/*` helpers | `initLensScene(canvas: HTMLCanvasElement): { dispose(): void }` |
| 3D works viewers + GLB export | `src/scene/specimens.ts`, `src/scene/specimens.css` | `initSpecimens(root: ParentNode): void` |
| Open bench: runnable/downloadable experiments + live shader editor | `src/lab/**`, `public/lab/**` | `initLab(root: ParentNode): void` from `src/lab/index.ts` |
| Shared contracts | `src/state.ts`, `src/content.ts`, `src/styles/tokens.css`, `src/main.ts` | integrator only; request changes instead of editing |

## DOM contracts

### Lens canvas

`<canvas id="lens-canvas" aria-hidden="true">` is a direct child of `<body>`, `position: fixed; inset: 0; z-index: 0; pointer-events: none`. Page content sits above it (`z-index: 1`). All sections are transparent except `#work` (the dark specimen chamber, opaque `--void`), which fully occludes the lens.

Lens choreography is layout-driven. Each section contains exactly one anchor element:

```html
<div data-lens-anchor="hero"></div>     <!-- assembled lens, right side of hero -->
<div data-lens-anchor="about"></div>    <!-- exploded lamellae -->
<div data-lens-anchor="lab"></div>      <!-- lamellae split into two shutters framing the bench -->
<div data-lens-anchor="contact"></div>  <!-- shallow reassembled lens behind the social pucks -->
```

The anchor's bounding rect (read once per frame, cheap) tells the scene where the lens should sit and how large it is. The scene blends between anchor states using `state.section[...]`. When `state.dark` is 1 the lens is fully occluded and the scene skips rendering.

### Section progress

Sections have ids `hero`, `about`, `work`, `lab`, `contact`. `initUI` writes `state.section[id]` (0 → 1 as the section passes through the viewport), `state.scroll`, `state.velocity`, `state.dark`, `state.pointer`, `state.activeSocial` and calls `triggerBurst()` on social activation.

### Specimens (inside `#work`)

```html
<article class="specimen" data-specimen-card data-kind="lens|knot|relief">
  <div class="specimen__stage" data-specimen="lens" tabindex="0"
       role="img" aria-label="…">            <!-- explicit aspect ratio; contains an inline SVG fallback drawing -->
  </div>
  … DOM title / year / stack / summary …
  <button type="button" data-specimen-action="wireframe" aria-pressed="false">Каркас</button>
  <button type="button" data-specimen-action="reset">Сбросить вид</button>
  <button type="button" data-specimen-action="download" data-file="s7-split-lens.glb">Скачать .glb</button>
  <p data-specimen-status aria-live="polite"></p>
</article>
```

`initSpecimens` lazily mounts a canvas into each stage (IntersectionObserver, at most one rendering at a time), adds `.is-live` to the stage when the first frame is drawn (CSS hides the SVG fallback then), supports drag-to-orbit, arrow-key orbit, `+`/`-` zoom and `0` reset while the stage is focused, and exports the procedural model as a real `.glb` with `GLTFExporter`. Download works even on tier 0 (no rendering needed).

### Open bench (inside `#lab`)

The section provides its own header plus `<div id="lab-mount" data-lab-root></div>`. `initLab` renders the entire bench UI inside the mount and imports its own `src/lab/lab.css`. Standalone experiments live in `public/lab/*.html`; each is a single self-contained file (three.js via an import map from jsDelivr) so the downloaded file runs by double-click. On the site they run inside `<iframe sandbox="allow-scripts">` only after an explicit Run.

## Social interactions

- Discord `@ascend_s7`: copies the handle when the puck opens (no stable profile URL exists for usernames). The same puck toggles the capsule shut. Clipboard fallback selects a read-only field.
- Telegram `@abouthard`: `https://t.me/abouthard`. The prism stays in the disc; a specular glint crosses the capsule.
- TikTok `@tg.abouthard`: `https://www.tiktok.com/@tg.abouthard`. The disc scales into a short account plate (handle, blurb, open, copy). Opening the profile is an explicit second action. Escape, outside click, and the close control collapse every channel.
- All handles are repeated as plain text in the footer.
