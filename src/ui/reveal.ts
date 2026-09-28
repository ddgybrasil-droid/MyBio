import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { state } from '../state';

gsap.registerPlugin(ScrollTrigger, SplitText);

interface MediaConditions {
  desktop: boolean;
  mobile: boolean;
  systemReduced: boolean;
}

export function initReveals(): void {
  let context: gsap.Context | null = null;
  let media: gsap.MatchMedia | null = null;
  let splits: SplitText[] = [];

  const rebuild = (): void => {
    media?.revert();
    context?.revert();
    splits.forEach((split) => split.revert());
    splits = [];

    context = gsap.context(() => {
      media = gsap.matchMedia();
      media.add(
        {
          desktop: '(min-width: 900px)',
          mobile: '(max-width: 899px)',
          systemReduced: '(prefers-reduced-motion: reduce)',
        },
        (matchContext) => {
          const conditions = matchContext.conditions as unknown as MediaConditions;
          const reduced = state.reducedMotion || conditions.systemReduced;
          const revealTargets = gsap.utils.toArray<HTMLElement>('[data-entry-reveal], [data-capability]');

          if (reduced) {
            gsap.set(revealTargets, { clearProps: 'all', autoAlpha: 1 });
            gsap.set('[data-wordmark] span, .hero-socials .social-puck', { clearProps: 'all', autoAlpha: 1 });
            return;
          }

          const heroTitle = document.querySelector<HTMLElement>('[data-hero-title]');
          const heroEyebrow = document.querySelector<HTMLElement>('[data-hero-eyebrow]');
          const heroLede = document.querySelector<HTMLElement>('[data-hero-lede]');
          const heroPucks = gsap.utils.toArray<HTMLElement>('.hero-socials .social-puck');
          const wordmarkLetters = gsap.utils.toArray<HTMLElement>('[data-wordmark] span');

          if (heroTitle) {
            const heroSplit = new SplitText(heroTitle, {
              type: 'lines',
              mask: 'lines',
              linesClass: 'split-line',
              aria: 'auto',
            });
            splits.push(heroSplit);
            const intro = gsap.timeline({ defaults: { ease: 'power4.out' } });
            intro
              .from(heroSplit.lines, {
                yPercent: 115,
                rotate: 1.2,
                duration: 1.05,
                stagger: 0.11,
              })
              .from(heroEyebrow, { autoAlpha: 0, y: 12, duration: 0.42 }, 0.16)
              .from(heroLede, { autoAlpha: 0, y: 20, duration: 0.7 }, 0.45)
              .from(
                heroPucks,
                {
                  autoAlpha: 0,
                  x: 28,
                  rotate: 45,
                  duration: 0.62,
                  stagger: 0.08,
                },
                0.48,
              )
              .from(
                wordmarkLetters,
                {
                  autoAlpha: 0,
                  x: (index: number) => (index - (wordmarkLetters.length - 1) / 2) * -18,
                  yPercent: 105,
                  duration: 0.9,
                  stagger: { each: 0.045, from: 'center' },
                },
                0.3,
              );
          }


          const headings = gsap.utils.toArray<HTMLElement>('[data-reveal-heading]');
          headings.forEach((heading) => {
            const split = new SplitText(heading, {
              type: 'lines,words,chars',
              mask: 'lines',
              linesClass: 'split-line',
              charsClass: 'split-char',
              aria: 'auto',
            });
            splits.push(split);
            gsap.from(split.chars, {
              yPercent: 112,
              autoAlpha: 0,
              duration: 0.68,
              stagger: 0.018,
              ease: 'power3.out',
              scrollTrigger: {
                trigger: heading,
                start: 'top 84%',
                once: true,
              },
            });
          });

          gsap.utils.toArray<HTMLElement>('[data-entry-reveal]').forEach((element) => {
            gsap.fromTo(
              element,
              { autoAlpha: 0, y: 24 },
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.72,
                ease: 'power3.out',
                scrollTrigger: {
                  trigger: element,
                  start: 'top 88%',
                  once: true,
                },
              },
            );
          });

          const capabilities = gsap.utils.toArray<HTMLElement>('[data-capability]');
          if (capabilities.length) {
            gsap.fromTo(
              capabilities,
              { autoAlpha: 0, y: 28 },
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.62,
                stagger: 0.1,
                ease: 'power3.out',
                scrollTrigger: {
                  trigger: '.capabilities',
                  start: 'top 82%',
                  once: true,
                },
              },
            );
          }

          gsap.fromTo(
            '.capabilities',
            { '--rule-progress': 0 },
            {
              '--rule-progress': 1,
              scrollTrigger: {
                trigger: '.capabilities',
                start: 'top 88%',
                end: 'top 58%',
                scrub: true,
              },
            },
          );

          const labShutters = gsap.utils.toArray<HTMLElement>('.lab__optic > span');
          gsap.to(labShutters, {
            xPercent: (index: number) => (index < 3 ? -70 - index * 8 : 70 + index * 5),
            ease: 'none',
            scrollTrigger: {
              trigger: '#lab',
              start: 'top 82%',
              end: 'top 18%',
              scrub: 0.75,
            },
          });

          gsap.from('.signal-plate .signal-plate__frame', {
            y: 36,
            autoAlpha: 0,
            duration: 0.8,
            stagger: 0.12,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: '.signal-bay',
              start: 'top 84%',
              once: true,
            },
          });

        },
      );
    });

    requestAnimationFrame(() => ScrollTrigger.refresh());
  };

  rebuild();
  document.addEventListener('s7:motion-change', rebuild);
}
