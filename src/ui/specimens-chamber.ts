import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { state } from '../state';

gsap.registerPlugin(ScrollTrigger);

/**
 * Dark specimen chamber: pinned scrub where each work blooms like a focus pull
 * out of the optical narrative (iris / aperture) — All-Star menu presentation,
 * not a cube wipe.
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
          cards.forEach((card) => {
            const stage = card.querySelector<HTMLElement>('.specimen__stage');
            if (!stage) return;
            gsap.fromTo(
              stage,
              { scale: 1.1, autoAlpha: 0.4, clipPath: 'circle(14% at 50% 46%)' },
              {
                scale: 1,
                autoAlpha: 1,
                clipPath: 'inset(0% 0% 0% 0%)',
                ease: 'none',
                scrollTrigger: {
                  trigger: card,
                  start: 'top 92%',
                  end: 'top 56%',
                  scrub: 0.55,
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
          defaults: { ease: 'power2.inOut' },
          scrollTrigger: {
            trigger: chamber,
            start: 'top top',
            // Longer runway: open bloom + hold + two iris handoffs with reading windows.
            end: () => `+=${Math.round(window.innerHeight * 4.8)}`,
            pin: true,
            scrub: 0.62,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
          onUpdate: () => {
            const active = Math.min(cards.length - 1, Math.floor(timeline.progress() * cards.length));
            showCard(active);
          },
        });

        // Opening bloom continues the pre-pin iris tease (optic dissolve → specimen focus).
        if (firstStage) {
          timeline.fromTo(
            firstStage,
            {
              scale: 1.08,
              autoAlpha: 0.7,
              filter: 'blur(4px)',
              clipPath: 'circle(40% at 50% 48%)',
            },
            {
              scale: 1,
              autoAlpha: 1,
              filter: 'blur(0px)',
              clipPath: 'inset(0% 0% 0% 0%)',
              duration: 0.78,
            },
            0,
          );
        }
        if (firstCopy) {
          timeline.fromTo(firstCopy, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.5 }, 0.26);
        }
        if (firstIndex) {
          timeline.fromTo(firstIndex, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.32 }, 0.2);
        }

        // Reading window — All-Star holds the product before the next morph.
        timeline.to({}, { duration: 0.92 });

        for (let index = 1; index < cards.length; index += 1) {
          const previous = cards[index - 1];
          const current = cards[index];
          const previousStage = previous?.querySelector<HTMLElement>('.specimen__stage');
          const previousCopy = previous?.querySelector<HTMLElement>('.specimen__copy');
          const currentStage = current?.querySelector<HTMLElement>('.specimen__stage');
          const currentCopy = current?.querySelector<HTMLElement>('.specimen__copy');
          const previousIndex = previous?.querySelector<HTMLElement>('.specimen__index');
          const currentIndex = current?.querySelector<HTMLElement>('.specimen__index');

          // Guard every target — GSAP warns on null selectors.
          if (!previousStage || !currentStage || !previous || !current) continue;

          timeline.set(current, { autoAlpha: 1, visibility: 'visible' });

          timeline.to(
            previousStage,
            {
              scale: 0.9,
              autoAlpha: 0,
              filter: 'blur(10px)',
              clipPath: 'circle(8% at 50% 50%)',
              duration: 0.58,
            },
            '<',
          );

          if (previousCopy) {
            timeline.to(previousCopy, { autoAlpha: 0, y: -22, duration: 0.28 }, '<0.05');
          }
          if (previousIndex) {
            timeline.to(previousIndex, { autoAlpha: 0, y: -8, duration: 0.2 }, '<');
          }

          timeline.fromTo(
            currentStage,
            {
              scale: 1.14,
              autoAlpha: 0.15,
              filter: 'blur(14px)',
              clipPath: 'circle(10% at 50% 48%)',
            },
            {
              scale: 1,
              autoAlpha: 1,
              filter: 'blur(0px)',
              clipPath: 'inset(0% 0% 0% 0%)',
              duration: 0.7,
            },
            '<0.08',
          );

          if (currentCopy) {
            timeline.fromTo(
              currentCopy,
              { autoAlpha: 0, y: 32 },
              { autoAlpha: 1, y: 0, duration: 0.48 },
              '<0.16',
            );
          }
          if (currentIndex) {
            timeline.fromTo(currentIndex, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.26 }, '<');
          }

          timeline.set(previous, { autoAlpha: 0, visibility: 'hidden' });
          timeline.to({}, { duration: 0.9 });
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
