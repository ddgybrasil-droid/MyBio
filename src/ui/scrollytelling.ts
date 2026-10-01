import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { state } from '../state';

gsap.registerPlugin(ScrollTrigger);

const PHASE_LABELS = [
  { until: 0.06, status: 'State / assembled', rotation: 'Hold / quiet', planes: 'Focus stack / 07' },
  { until: 0.9, status: 'State / separate', rotation: 'Gap / equal', planes: 'Seven planes / open' },
  { until: 1.01, status: 'State / settle', rotation: 'Compressed', planes: 'Match / work' },
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
 * All-Star-style pinned scrub: GSAP pin:true holds the hero stage while scroll
 * drives the optic timeline 1:1. Pin spacing is the runway.
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

    hero.classList.remove('is-pinned');
    const pinTarget = hero.querySelector<HTMLElement>('.hero__pin') ?? hero;

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

        hero.classList.add('is-pinned');

        // Locked scrub — kill residual float vs All-Star pin (pass 2 still lagged).
        const storyScrub = desktop ? 0.06 : 0.05;
        // Longer runway so the open stack can hold like THE STACK before compress.
        const scrubRunway = (): number => Math.round(window.innerHeight * (desktop ? 3.15 : 2.9));

        const chapter = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: pinTarget,
            start: 'top top',
            end: () => `+=${scrubRunway()}`,
            pin: true,
            pinSpacing: true,
            scrub: storyScrub,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              state.story = self.progress;
              setLensData(self.progress);
            },
          },
        });

        if (heroCopy) {
          chapter.fromTo(
            heroCopy,
            { yPercent: 0, autoAlpha: 1 },
            { yPercent: desktop ? 10 : 6, autoAlpha: 0, duration: 0.16 },
            0.02,
          );
        }

        if (heroTitle) {
          chapter.fromTo(
            heroTitle,
            { fontVariationSettings: '"wght" 515' },
            { fontVariationSettings: '"wght" 460', duration: 0.16 },
            0.02,
          );
        }

        if (heroSocials) {
          chapter.fromTo(heroSocials, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -12, duration: 0.16 }, 0.04);
        }

        if (scrollCue) {
          chapter.fromTo(scrollCue, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.1 }, 0);
        }

        if (wordmark.length) {
          chapter.fromTo(
            wordmark,
            { yPercent: 0, autoAlpha: 0.55 },
            { yPercent: desktop ? 18 : 12, autoAlpha: 0, duration: 0.26, stagger: 0.008 },
            0.06,
          );
        }

        // Continuous cream→void melt while About still owns the frame so settle → Work
        // reads as one match-cut (All-Star burger→content), not pin-release / hard cut.
        if (work) {
          const about = document.getElementById('about');
          const eyebrow = work.querySelector<HTMLElement>('.work__heading .eyebrow');
          const workTitle = work.querySelector<HTMLElement>('.work__heading h2');
          const counter = work.querySelector<HTMLElement>('.specimen-counter');
          const firstStage = work.querySelector<HTMLElement>('[data-specimen="lens"]');
          const veilProxy = { v: 0 };

          gsap
            .timeline({
              scrollTrigger: {
                trigger: about ?? work,
                // Start melt while About still owns the frame — no empty cream beat.
                start: about ? 'top 78%' : 'top 120%',
                endTrigger: work,
                end: 'top 0%',
                scrub: desktop ? 0.12 : 0.1,
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
                  // Slight ease-in so cream holds, then commits to void.
                  const eased = t * t * (3 - 2 * t);
                  document.documentElement.style.setProperty('--chamber-veil', String(eased));
                },
              },
              0,
            );

          if (eyebrow) {
            gsap.fromTo(
              eyebrow,
              { autoAlpha: 0, y: 10 },
              {
                autoAlpha: 1,
                y: 0,
                ease: 'none',
                scrollTrigger: {
                  trigger: work,
                  start: 'top 90%',
                  end: 'top 55%',
                  scrub: 0.12,
                },
              },
            );
          }

          // Owned only here — reveal.ts skips #work headings to avoid SplitText fight.
          if (workTitle) {
            gsap.fromTo(
              workTitle,
              { autoAlpha: 0, y: 28, filter: 'blur(8px)' },
              {
                autoAlpha: 1,
                y: 0,
                filter: 'blur(0px)',
                ease: 'none',
                scrollTrigger: {
                  trigger: work,
                  start: 'top 86%',
                  end: 'top 44%',
                  scrub: desktop ? 0.12 : 0.1,
                },
              },
            );
          }

          if (counter) {
            gsap.fromTo(
              counter,
              { autoAlpha: 0, y: 8 },
              {
                autoAlpha: 1,
                y: 0,
                ease: 'none',
                scrollTrigger: {
                  trigger: work,
                  start: 'top 80%',
                  end: 'top 50%',
                  scrub: 0.1,
                },
              },
            );
          }

          // Iris tease: first specimen grows from the optical centre while the optic
          // dissolves — bridge into the chamber pin bloom (no empty dark beat).
          if (firstStage && !state.reducedMotion) {
            gsap.fromTo(
              firstStage,
              {
                scale: 1.22,
                autoAlpha: 0.28,
                filter: 'blur(10px)',
                clipPath: 'circle(12% at 50% 48%)',
              },
              {
                scale: 1.02,
                autoAlpha: 0.92,
                filter: 'blur(1px)',
                clipPath: 'circle(52% at 50% 48%)',
                ease: 'none',
                scrollTrigger: {
                  trigger: work,
                  start: 'top 82%',
                  end: 'top top',
                  scrub: desktop ? 0.1 : 0.08,
                },
              },
            );
          }
        }

        return () => {
          hero.classList.remove('is-pinned');
          state.story = 0;
          setLensData(0);
          document.documentElement.style.setProperty('--chamber-veil', '0');
          const workTitle = work?.querySelector<HTMLElement>('.work__heading h2');
          const firstStage = work?.querySelector<HTMLElement>('[data-specimen="lens"]');
          gsap.set([workTitle, firstStage].filter(Boolean), { clearProps: 'all' });
        };
      },
    );

    requestAnimationFrame(() => ScrollTrigger.refresh());
  };

  build();
  document.addEventListener('s7:motion-change', build);
}
