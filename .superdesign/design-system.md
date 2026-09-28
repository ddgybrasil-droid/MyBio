# S7 Optical Archive — Design System

## Product

A personal bio and interactive portfolio for ASCEND / S7. The site presents:

- Discord: `@ascend_s7` — copy handle because a username alone has no reliable profile URL.
- Telegram: `@abouthard` — link to `https://t.me/abouthard`.
- TikTok: `@tg.abouthard` — an icon that physically expands into an account capsule before the visitor opens the profile.
- A gallery for authored 3D work.
- A lab for downloadable and browser-runnable code experiments.

The page must remain complete as semantic HTML when WebGL, backdrop filters, or motion are unavailable.

## Visual concept: S7 Optical Archive

The site feels like a daylight optical laboratory. Work and contact channels are physical specimens moving through a precision glass apparatus. The signature object is the **S7 Split Lens**: seven thin glass lamellae stacked into one circular optic. It travels through the page and changes function instead of being repeated as decoration.

The selected Superdesign prompt, “One Product That Travels the Whole Page,” owns the composition and motion model: one persistent object follows a reversible scroll path; fixed demonstrations show the work itself; evidence stays factual. Its stationery styling is not copied literally. This product uses a cooler mineral-paper canvas, technical sans typography, and optical materials.

## Reference lock

### Preserve

- One meaningful travelling object, the S7 Split Lens, across the opening narrative.
- Native scrolling; scroll position drives reversible 3D state.
- A visible, measurable demonstration rather than decorative animation.
- Hairline rules, spacious editorial composition, and strong full-width identity typography.
- Clear glass only above visually rich media; frostier glass behind text.
- Real DOM copy, links, and buttons. WebGL is enhancement only.

### Borrow only

- The travelling-product path and large cropped wordmark from the selected prompt.
- Functional material changes inspired by liquid-glass controls: glass thickens, expands, and becomes more opaque when it must carry text.

### Reject

- Purple/cyan neon, stars, particle fog, scanlines, terminal cosplay, grid floors, bloom, or glitch.
- Generic blobs, floating card walls, bento grids, nested glass, and glass around every section.
- Gradient fills, oversized rounded SaaS cards, decorative serif/italic word swaps, fake awards, fake metrics, and fake client logos.
- Scroll-jacking or interactions that hide normal links.

## Palette

- `canvas`: `#ECEBE5` — mineral-paper background.
- `surface-solid`: `#F7F6F0` — accessible fallback for glass.
- `ink`: `#151816` — primary copy.
- `ink-secondary`: `#5B615D` — supporting copy.
- `line`: `rgba(21, 24, 22, 0.16)` — rules and optical markings.
- `gallery-void`: `#111412` — used only inside the work chamber.
- `action`: `#FF5633` — Run, Download, and primary action only.
- `focus`: `#006D67` — keyboard focus only.
- `specular`: `rgba(255, 255, 255, 0.72)` — glass edge light.

Platform colors stay inside official glyphs and their reveal states.

## Typography

- Display and body: Archivo Variable, locally hosted, `font-display: swap`.
- Code and optical metadata: IBM Plex Mono.
- Hero: `clamp(3.5rem, 10vw, 9.5rem)`, weight 520, line-height 0.86.
- Section title: `clamp(2.25rem, 5vw, 5.25rem)`.
- Body: `clamp(1rem, 0.4vw + 0.9rem, 1.25rem)`, line-height 1.55, max-width 62ch.
- Metadata: 12–13px, letter-spacing 0.06em.
- The hero may animate Archivo’s width axis from 84% to 100%. No other decorative type animation.

## Grid and geometry

- 8px base spacing.
- Desktop: 12 columns, max-width 1600px, 48–72px gutters.
- Tablet: 8 columns, 32px gutters.
- Mobile: 4 columns, 20px gutters.
- Section gaps: 96 / 144 / 208px.
- General radius: 2–8px. Full pills only for physical pucks and capsules.
- Touch targets: 44px minimum; 48px on touch.

## Glass

### Clear lens

For visual controls and icon pucks only: about 16% surface opacity, 16–20px blur, crisp edge highlight, mild refraction. Never place paragraphs on it.

### Regular glass

For expanded social panels and experiment controls: 58–70% opacity, 24–30px blur, minimal distortion, guaranteed text contrast.

### Solid fallback

Use `surface-solid` with a 1px structural border for reduced transparency, unsupported browsers, and weak devices. Never nest glass inside glass.

## Page structure

### Fixed optical rail

A 56px DOM navigation rail: `ASCEND / S7`, current section, seven progression ticks, and Contact. Nearly invisible over light sections and frosted over the dark gallery.

### Hero — Calibration

Approximately 140vh. Identity occupies the lower-left six columns. A 62vw S7 Split Lens floats off-centre right and refracts a short factual practice statement. Three social glyphs align on the far-right calibration rail. A huge cropped `ASCEND / S7` wordmark anchors the bottom edge.

### Bio — Operator Notes

One concise biography at left, capabilities along a ruled measurement strip, and an exploded view of the seven lens lamellae at right. No portrait unless a real asset is supplied.

### Work — Specimen Chamber

The canvas moves into `gallery-void`. Projects are bespoke 3D specimens held by glass-and-aluminium fixtures, not cards. One project occupies attention at a time with title, role, year, stack, outcome, and a real Inspect link in adjacent DOM content.

### Experiments — Open Bench

Wide irregular work surfaces with live preview, premise, technology, browser requirements, and explicit Run, Reset, Fullscreen, Source, and Download controls. Expensive code never auto-runs and pauses offscreen.

### Contact — Signal Output

Three physical glass pucks on an aluminium rail:

1. Discord `@ascend_s7`
2. Telegram `@abouthard`
3. TikTok `@tg.abouthard`

Plain-text links/handles repeat in the footer.

## Motion choreography

- Hero: seven lamellae rise and assemble once; scroll rotates the resulting lens only 16 degrees.
- Bio: lamellae separate in depth; one becomes the section object.
- Work: one controlled camera track with stable reading windows; active specimens react to pointer by no more than 3 degrees.
- Experiments: the chamber opens like two optical shutters. Controls attach only when a demo is active.
- Contact: three pucks roll no more than 30px onto a rail; the final state becomes still.
- Native scroll is always the source of truth. Entry reveals happen once; lens and camera states reverse with scroll.
- Preserve the system cursor. A subtle optical follower is allowed only on fine pointers and never above prose or code.

### TikTok morph

Resting state is a 48px circular glass lens containing the official TikTok glyph. On activation:

1. Compress to 0.94 for 90ms.
2. Extend seven lamellae horizontally into a 280px capsule over 320ms.
3. Make the expanded material frostier as text enters.
4. Move the glyph into a left socket.
5. Reveal `@tg.abouthard` behind the moving glyph.
6. Resolve `Open TikTok ↗` at the right edge.

First tap expands; the explicit second action opens the profile. Escape or outside click collapses it. Reduced motion uses an instant width change and a 120ms text fade.

## Responsive and capability tiers

- Desktop: full fixed WebGL canvas, one pinned gallery sequence, DPR capped at 1.5.
- Tablet: shorter camera path, at most two loaded specimens, DPR 1.25.
- Mobile: no long pinned sections; vertical projects; one lightweight scene or poster at a time; social capsules expand inline.
- Weak devices: pre-rendered image/video substitutes and opacity/transform transitions only.
- Pause all render loops when offscreen or hidden.

## Accessibility

- Canvas is decorative and `aria-hidden`; meaningful content is duplicated in semantic DOM.
- Real links and buttons, visible labels, 44px targets, logical focus order, and WCAG AA contrast.
- `prefers-reduced-motion`: no camera dolly, parallax, springs, pointer following, or scrubbed rotation; fades stay under 150ms.
- `prefers-reduced-transparency`: solid surfaces and structural borders.
- Async copy, run, and download states announce through `aria-live="polite"`.
- No interaction depends on hover.

## Decision ledger

| Decision | Source | Role |
|---|---|---|
| One S7 lens travelling through sections | Selected Superdesign prompt | Owns composition and reversible scroll continuity |
| Mineral paper plus dark specimen chamber | S7 concept | Separates biography from work without generic neon |
| Safety orange | Product requirement | Primary actions only |
| Functional liquid glass | User brief | Interactive controls and optical hierarchy only |
| Semantic DOM plus one WebGL canvas | Architecture constraint | Performance, accessibility, graceful fallback |
| Expand-before-open social interaction | User brief | Makes contact memorable without delaying access |
