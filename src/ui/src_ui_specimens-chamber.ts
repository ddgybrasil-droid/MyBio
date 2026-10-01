import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { state } from '../state';

gsap.registerPlugin(ScrollTrigger);

/**
 * Dark specimen chamber: pinned scrub where each work blooms like a focus pull
 * out of the optical narrative (iris / aperture), not a generic card wipe.
 */
export function initSpecimenChamber(): void {
  const chamber = document.getElementById('work');
  const cards = [...document.querySelectorAll<HTMLElement>('[data-specimen-card]')];
  const counter = document.querySelector<HTMLElement>('[data-specimen-counter]');
  let media: gsap.MatchMedia | null = null;

  if (!chamber || cards.length === 0) return;

  const showCard = (index: number): void => {
    cards.forEach((card, cardIndex) => card.classList.toggle('is-active', cardIndex === index));
    if (counter) counter.textContent = String(index + 1).padStart(2, '0');
  };

  const build = (): void => {
    media?.revert();
    chamber.classList.remove('is-pinned');
    gsap.set(cards, { clearProps: 'all' });
    gsap.set(cards.flatMap((card) => [...card.children]), { clearProps: 'all' });
    showCard(0);

    media = gsap.matchMedia();
    media.add(
      {
        desktop: '(min-width: 900px)',
        mobile: '(max-width: 899px)',
      },
      (context) => {
        const desktop = Boolean(context.conditions?.desktop);
        if (state.reducedMotion) return;

        if (!desktop) {
          // Mobile keeps a scrolling stack. Each stage still opens like a focus pull out of the optic.
          cards.forEach((card) => {
            const stage = card.querySelector<HTMLElement>('.specimen__stage');
            if (!stage) return;
            gsap.fromTo(
              stage,
              { scale: 1.12, autoAlpha: 0.45, clipPath: 'circle(16% at 50% 46%)' },
              {
                scale: 1,
                autoAlpha: 1,
                clipPath: 'inset(0% 0% 0% 0%)',
                ease: 'none',
                scrollTrigger: {
                  trigger: card,
                  start: 'top 92%',
                  end: 'top 58%',
                  scrub: 0.7,
                },
              },
            );
          });
          return () => {
            gsap.set(cards, { clearProps: 'all' });
            cards.forEach((card) => {
              const stage = card.querySelector<HTMLElement>('.specimen__stage');
              if (stage) gsap.set(stage, { clearProps: 'all' });
            });
            showCard(0);
          };
        }

        chamber.classList.add('is-pinned');
        gsap.set(cards.slice(1), { autoAlpha: 0 });

        const firstStage = cards[0]?.querySelector<HTMLElement>('.specimen__stage');
        const firstCopy = cards[0]?.querySelector<HTMLElement>('.specimen__copy');
        const firstIndex = cards[0]?.querySelector<HTMLElement>('.specimen__index');

        const timeline = gsap.timeline({
          defaults: { ease: 'power3.inOut' },
          scrollTrigger: {
            trigger: chamber,
            start: 'top top',
            end: () => `+=${Math.round(window.innerHeight * 4.2)}`,
            pin: true,
            scrub: 0.78,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
          onUpdate: () => {
            const active = Math.min(cards.length - 1, Math.floor(timeline.progress() * cards.length));
            showCard(active);
          },
        });

        // Opening bloom continues the pre-pin iris tease from scrollytelling
        // (optic dissolve → specimen focus), not a fresh hard cut from 12%.
        if (firstStage) {
          timeline.fromTo(
            firstStage,
            {
              scale: 1.1,
              autoAlpha: 0.55,
              filter: 'blur(6px)',
              clipPath: 'circle(34% at 50% 48%)',
            },
            {
              scale: 1,
              autoAlpha: 1,
              filter: 'blur(0px)',
              clipPath: 'inset(0% 0% 0% 0%)',
              duration: 0.72,
            },
            0,
          );
        }
        if (firstCopy) {
          timeline.fromTo(firstCopy, { autoAlpha: 0, y: 36 }, { autoAlpha: 1, y: 0, duration: 0.55 }, 0.28);
        }
        if (firstIndex) {
          timeline.fromTo(firstIndex, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.35 }, 0.22);
        }

        timeline.to({}, { duration: 0.75 });

        for (let index = 1; index < cards.length; index += 1) {
          const previous = cards[index - 1];
          const current = cards[index];
          const previousStage = previous?.querySelector<HTMLElement>('.specimen__stage');
          const previousCopy = previous?.querySelector<HTMLElement>('.specimen__copy');
          const currentStage = current?.querySelector<HTMLElement>('.specimen__stage');
          const currentCopy = current?.querySelector<HTMLElement>('.specimen__copy');
          const previousIndex = previous?.querySelector<HTMLElement>('.specimen__index');
          const currentIndex = current?.querySelector<HTMLElement>('.specimen__index');

          timeline
            .set(current, { autoAlpha: 1, visibility: 'visible' })
            .to(
              previousStage,
              {
                scale: 0.88,
                autoAlpha: 0,
                filter: 'blur(8px)',
                clipPath: 'circle(10% at 50% 50%)',
                rotateY: -4,
                duration: 0.62,
              },
              '<',
            )
            .to(previousCopy, { autoAlpha: 0, y: -28, duration: 0.32 }, '<0.06')
            .to(previousIndex, { autoAlpha: 0, y: -10, duration: 0.22 }, '<')
            .fromTo(
              currentStage,
              {
                scale: 1.12,
                autoAlpha: 0.2,
                filter: 'blur(12px)',
                clipPath: 'circle(12% at 50% 48%)',
                rotateY: 5,
              },
              {
                scale: 1,
                autoAlpha: 1,
                filter: 'blur(0px)',
                clipPath: 'inset(0% 0% 0% 0%)',
                rotateY: 0,
                duration: 0.72,
              },
              '<0.1',
            )
            .fromTo(
              currentCopy,
              { autoAlpha: 0, y: 40 },
              { autoAlpha: 1, y: 0, duration: 0.5 },
              '<0.18',
            )
            .fromTo(currentIndex, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.28 }, '<')
            .set(previous, { autoAlpha: 0, visibility: 'hidden' })
            .to({}, { duration: 0.78 });
        }

        return () => {
          chamber.classList.remove('is-pinned');
          cards.forEach((card) => {
            card.classList.remove('is-active');
            gsap.set(card, { clearProps: 'all' });
            gsap.set([...card.children], { clearProps: 'all' });
          });
          showCard(0);
        };
      },
    );

    requestAnimationFrame(() => ScrollTrigger.refresh());
  };

  build();
  document.addEventListener('s7:motion-change', build);
}
