import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { state } from '../state';

gsap.registerPlugin(ScrollTrigger);

const PHASE_LABELS = [
  { until: 0.22, status: 'State / assembled', rotation: 'Yaw / quiet', planes: 'Focus stack / 07' },
  { until: 0.52, status: 'State / peel', rotation: 'Barrel spacing', planes: 'Depth peel / active' },
  { until: 0.78, status: 'State / gimbal', rotation: 'Soft tilt', planes: 'Examination / mid' },
  { until: 1.01, status: 'State / settle', rotation: 'Handoff / about', planes: 'Specimen path / open' },
] as const;

function phaseFor(progress: number): (typeof PHASE_LABELS)[number] {
  for (const phase of PHASE_LABELS) {
    if (progress < phase.until) return phase;
  }
  return PHASE_LABELS[PHASE_LABELS.length - 1];
}

function setLensData(progress: number): void {
  const root = document.querySelector<HTMLElement>('[data-lens-data]');
  if (!root) return;
  const phase = phaseFor(progress);
  const rotation = root.querySelector<HTMLElement>('[data-lens-rotation]');
  const planes = root.querySelector<HTMLElement>('[data-lens-planes]');
  const status = root.querySelector<HTMLElement>('[data-lens-state]');
  if (rotation) rotation.textContent = phase.rotation;
  if (planes) planes.textContent = phase.planes;
  if (status) status.textContent = phase.status;
  root.dataset.phase = phase.status.split('/').pop()?.trim() ?? 'assembled';
}

/**
 * Scrub-linked opening chapter: Lenis + ScrollTrigger drive `state.story`,
 * which the Three.js lens reads every frame (All Star Burgers–style scrub,
 * optical-glass themed). Specimens inherit continuity via the dark chamber pin.
 */
export function initScrollytelling(): void {
  let media: gsap.MatchMedia | null = null;

  const build = (): void => {
    media?.revert();
    state.story = 0;
    setLensData(0);

    const hero = document.getElementById('hero');
    const about = document.getElementById('about');
    const work = document.getElementById('work');
    if (!hero) return;

    media = gsap.matchMedia();
    media.add(
      {
        desktop: '(min-width: 900px)',
        mobile: '(max-width: 899px)',
        reduced: '(prefers-reduced-motion: reduce)',
      },
      (context) => {
        const reduced = state.reducedMotion || Boolean(context.conditions?.reduced);
        const desktop = Boolean(context.conditions?.desktop);
        const wordmark = gsap.utils.toArray<HTMLElement>('[data-wordmark] span');
        const heroCopy = document.querySelector<HTMLElement>('.hero__copy');
        const heroTitle = document.querySelector<HTMLElement>('[data-hero-title]');
        const scrollCue = document.querySelector<HTMLElement>('.scroll-cue');
        const lensField = document.querySelector<HTMLElement>('.hero__lens-field');
        const heroSocials = document.querySelector<HTMLElement>('.hero-socials');

        if (reduced) {
          state.story = 0;
          setLensData(0);
          gsap.set([heroCopy, scrollCue, lensField, heroSocials, wordmark].flat().filter(Boolean), {
            clearProps: 'all',
          });
          return;
        }

        const storyProxy = { value: 0 };

        // Primary scrub: hero top → about mid. Tall hero gives runway like a burger pin chapter.
        ScrollTrigger.create({
          trigger: hero,
          start: 'top top',
          endTrigger: about ?? hero,
          end: about ? 'center center' : 'bottom top',
          scrub: desktop ? 0.9 : 0.65,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            storyProxy.value = self.progress;
            state.story = self.progress;
            setLensData(self.progress);
          },
        });

        const chapter = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: hero,
            start: 'top top',
            endTrigger: about ?? hero,
            end: about ? 'center center' : 'bottom top',
            scrub: desktop ? 0.9 : 0.65,
            invalidateOnRefresh: true,
          },
        });

        if (heroCopy) {
          chapter.fromTo(
            heroCopy,
            { yPercent: 0, autoAlpha: 1 },
            { yPercent: desktop ? 18 : 8, autoAlpha: 0.12, duration: 1 },
            0,
          );
        }

        if (heroTitle) {
          chapter.fromTo(
            heroTitle,
            { fontVariationSettings: '"wght" 515' },
            { fontVariationSettings: '"wght" 420', duration: 1 },
            0,
          );
        }

        if (wordmark.length) {
          chapter.fromTo(
            wordmark,
            {
              x: 0,
              yPercent: 0,
              autoAlpha: 1,
            },
            {
              x: (index: number) => (index - (wordmark.length - 1) / 2) * (desktop ? 18 : 8),
              yPercent: (index: number) => Math.abs(index - (wordmark.length - 1) / 2) * 4 + 48,
              autoAlpha: 0.35,
              duration: 1,
            },
            0,
          );
        }

        if (scrollCue) {
          chapter.fromTo(
            scrollCue,
            { autoAlpha: 1, x: 0 },
            { autoAlpha: 0, x: -24, duration: 0.35 },
            0,
          );
        }

        if (lensField && desktop) {
          chapter.fromTo(
            lensField,
            { scale: 1, xPercent: 0 },
            { scale: 1.03, xPercent: -2, duration: 0.6 },
            0.1,
          );
          chapter.to(lensField, { scale: 0.98, xPercent: -5, duration: 0.4 }, 0.6);
        }

        if (heroSocials) {
          chapter.fromTo(heroSocials, { autoAlpha: 1, y: 0 }, { autoAlpha: 0.2, y: -28, duration: 0.55 }, 0.2);
        }

        // Bridge into the dark specimen chamber: longer soft veil, heading blooms late.
        if (work && desktop) {
          const heading = work.querySelector<HTMLElement>('.work__heading');
          const counter = work.querySelector<HTMLElement>('.specimen-counter');
          const veilProxy = { v: 0 };
          gsap
            .timeline({
              scrollTrigger: {
                trigger: work,
                start: 'top 98%',
                end: 'top 8%',
                scrub: 1.05,
                invalidateOnRefresh: true,
              },
            })
            .to(
              veilProxy,
              {
                v: 1,
                duration: 1,
                ease: 'none',
                onUpdate: () => {
                  // Ease the CSS custom property for a cream→void handoff that feels continuous.
                  const t = veilProxy.v;
                  const eased = t * t * (3 - 2 * t);
                  work.style.setProperty('--chamber-veil', String(eased));
                },
              },
              0,
            );

          if (heading) {
            gsap.fromTo(
              heading,
              { autoAlpha: 0, y: 28, filter: 'blur(6px)' },
              {
                autoAlpha: 1,
                y: 0,
                filter: 'blur(0px)',
                ease: 'none',
                scrollTrigger: {
                  trigger: work,
                  start: 'top 82%',
                  end: 'top 28%',
                  scrub: 0.95,
                },
              },
            );
          }

          if (counter) {
            gsap.fromTo(
              counter,
              { autoAlpha: 0, y: 12 },
              {
                autoAlpha: 1,
                y: 0,
                ease: 'none',
                scrollTrigger: {
                  trigger: work,
                  start: 'top 68%',
                  end: 'top 30%',
                  scrub: 0.85,
                },
              },
            );
          }
        }

        return () => {
          state.story = 0;
          setLensData(0);
        };
      },
    );

    requestAnimationFrame(() => ScrollTrigger.refresh());
  };

  build();
  document.addEventListener('s7:motion-change', build);
}
