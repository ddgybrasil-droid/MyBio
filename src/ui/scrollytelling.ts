import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { state } from '../state';

gsap.registerPlugin(ScrollTrigger);

const PHASE_LABELS = [
  { until: 0.16, status: 'State / assembled', rotation: 'Hold / quiet', planes: 'Focus stack / 07' },
  { until: 0.74, status: 'State / open', rotation: 'Axis / depth', planes: 'Spacing / reveal' },
  { until: 1.01, status: 'State / settle', rotation: 'Resolved / still', planes: 'Handoff / about' },
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
 * Scrub-linked opening chapter. Scroll progress drives the optic 1:1
 * (assembled → depth/spacing reveal → settle) for the pinned hero.
 * A separate veil releases the cream field into the Work chamber.
 */
export function initScrollytelling(): void {
  let media: gsap.MatchMedia | null = null;

  const build = (): void => {
    media?.revert();
    state.story = 0;
    setLensData(0);

    const hero = document.getElementById('hero');
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
          document.documentElement.style.setProperty('--chamber-veil', '0');
          work?.style.removeProperty('--chamber-veil');
          gsap.set([heroCopy, scrollCue, lensField, heroSocials, wordmark].flat().filter(Boolean), {
            clearProps: 'all',
          });
          return;
        }

        // Story completes while the hero grid is pinned, so the reveal does not
        // play during the flight into About.
        const storyScrub = desktop ? 0.22 : 0.18;
        ScrollTrigger.create({
          trigger: hero,
          start: 'top top',
          end: 'bottom bottom',
          scrub: storyScrub,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            state.story = self.progress;
            setLensData(self.progress);
          },
        });

        const chapter = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: hero,
            start: 'top top',
            end: 'bottom bottom',
            scrub: storyScrub,
            invalidateOnRefresh: true,
          },
        });

        if (heroCopy) {
          chapter.fromTo(
            heroCopy,
            { yPercent: 0, autoAlpha: 1 },
            { yPercent: desktop ? 14 : 8, autoAlpha: 0, duration: 0.42 },
            0.06,
          );
        }

        if (heroTitle) {
          chapter.fromTo(
            heroTitle,
            { fontVariationSettings: '"wght" 515' },
            { fontVariationSettings: '"wght" 460', duration: 0.42 },
            0.06,
          );
        }

        if (lensField && desktop) {
          chapter.fromTo(
            lensField,
            { scale: 1, xPercent: 0, yPercent: 0 },
            { scale: 1.06, xPercent: -2, yPercent: 1, duration: 0.34 },
            0.1,
          );
          chapter.to(lensField, { scale: 1, xPercent: 0, yPercent: 0, duration: 0.24 }, 0.74);
        }

        if (lensField && !desktop) {
          // Bring the optic into the frame for the scrub, then settle it back before the pin releases.
          chapter.fromTo(
            lensField,
            { scale: 1, xPercent: 0, yPercent: 0 },
            { scale: 1.55, xPercent: -30, yPercent: 26, duration: 0.36 },
            0.08,
          );
          chapter.to(lensField, { scale: 1.05, xPercent: -8, yPercent: 4, duration: 0.24 }, 0.74);
        }

        if (heroSocials) {
          chapter.fromTo(heroSocials, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -20, duration: 0.32 }, 0.08);
        }

        // Long cream→void melt on every breakpoint. The optic's own retreat is driven by state.handoff.
        if (work) {
          const eyebrow = work.querySelector<HTMLElement>('.work__heading .eyebrow');
          const counter = work.querySelector<HTMLElement>('.specimen-counter');
          const veilProxy = { v: 0 };
          gsap
            .timeline({
              scrollTrigger: {
                trigger: work,
                start: 'top 118%',
                end: 'top 10%',
                scrub: desktop ? 1.25 : 0.9,
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
                  const t = veilProxy.v;
                  const eased = t * t * (3 - 2 * t);
                  document.documentElement.style.setProperty('--chamber-veil', String(eased));
                },
              },
              0,
            );

          if (eyebrow) {
            gsap.fromTo(
              eyebrow,
              { autoAlpha: 0, y: 16 },
              {
                autoAlpha: 1,
                y: 0,
                ease: 'none',
                scrollTrigger: {
                  trigger: work,
                  start: 'top 58%',
                  end: 'top 36%',
                  scrub: 0.7,
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
                  start: 'top 52%',
                  end: 'top 34%',
                  scrub: 0.7,
                },
              },
            );
          }
        }

        return () => {
          state.story = 0;
          setLensData(0);
          document.documentElement.style.setProperty('--chamber-veil', '0');
        };
      },
    );

    requestAnimationFrame(() => ScrollTrigger.refresh());
  };

  build();
  document.addEventListener('s7:motion-change', build);
}
