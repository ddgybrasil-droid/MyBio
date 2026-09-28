import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { state } from '../state';

gsap.registerPlugin(ScrollTrigger);

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
        if (!desktop || state.reducedMotion) return;

        chamber.classList.add('is-pinned');
        gsap.set(cards.slice(1), { autoAlpha: 0 });

        const timeline = gsap.timeline({
          defaults: { ease: 'power3.inOut' },
          scrollTrigger: {
            trigger: chamber,
            start: 'top top',
            end: () => `+=${Math.round(window.innerHeight * 3.8)}`,
            pin: true,
            scrub: 0.85,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
          onUpdate: () => {
            const active = Math.min(cards.length - 1, Math.floor(timeline.progress() * cards.length));
            showCard(active);
          },
        });

        timeline.to({}, { duration: 0.9 });

        for (let index = 1; index < cards.length; index += 1) {
          const previous = cards[index - 1];
          const current = cards[index];
          const previousStage = previous?.querySelector<HTMLElement>('.specimen__stage');
          const previousCopy = previous?.querySelector<HTMLElement>('.specimen__copy');
          const currentStage = current?.querySelector<HTMLElement>('.specimen__stage');
          const currentCopy = current?.querySelector<HTMLElement>('.specimen__copy');

          timeline
            .set(current, { autoAlpha: 1, visibility: 'visible' })
            .to(
              previousStage,
              {
                scale: 0.84,
                clipPath: 'inset(12% 50% 12% 0%)',
                rotateY: -7,
                duration: 0.58,
              },
              '<',
            )
            .to(previousCopy, { autoAlpha: 0, y: -42, duration: 0.38 }, '<0.08')
            .fromTo(
              currentStage,
              {
                scale: 1.14,
                clipPath: 'inset(6% 0% 6% 54%)',
                rotateY: 7,
              },
              {
                scale: 1,
                clipPath: 'inset(0% 0% 0% 0%)',
                rotateY: 0,
                duration: 0.7,
              },
              '<0.08',
            )
            .fromTo(
              currentCopy,
              { autoAlpha: 0, y: 48 },
              { autoAlpha: 1, y: 0, duration: 0.52 },
              '<0.16',
            )
            .set(previous, { autoAlpha: 0, visibility: 'hidden' })
            .to({}, { duration: 0.9 });
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
