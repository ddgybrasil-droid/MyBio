import { gsap } from 'gsap';
import { state } from '../state';

const textSelector = 'p, h1, h2, h3, li, dt, dd, code, pre, input, textarea, [contenteditable="true"]';
const magneticSelector = '.social-puck, .optical-nav__contact, [data-specimen-action="download"], .tiktok-card__actions a';

export function initCursor(): void {
  const cursor = document.querySelector<HTMLElement>('[data-optical-cursor]');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let targetX = -100;
  let targetY = -100;
  let currentX = -100;
  let currentY = -100;

  const render = (): void => {
    if (!cursor || !finePointer.matches || state.reducedMotion) return;
    currentX += (targetX - currentX) * 0.16;
    currentY += (targetY - currentY) * 0.16;
    cursor.style.transform = `translate3d(${currentX - 14}px, ${currentY - 14}px, 0)`;
  };

  gsap.ticker.add(render);

  window.addEventListener(
    'pointermove',
    (event) => {
      state.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      state.pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
      targetX = event.clientX;
      targetY = event.clientY;

      const target = event.target instanceof Element ? event.target : null;
      cursor?.classList.toggle('is-hidden', Boolean(target?.closest(textSelector)));

      const puck = target?.closest<HTMLElement>('.social-puck');
      if (puck) {
        const rect = puck.getBoundingClientRect();
        puck.style.setProperty('--mx', `${((event.clientX - rect.left) / rect.width) * 100}%`);
        puck.style.setProperty('--my', `${((event.clientY - rect.top) / rect.height) * 100}%`);
      }
    },
    { passive: true },
  );

  const magneticElements = [...document.querySelectorAll<HTMLElement>(magneticSelector)];
  for (const element of magneticElements) {
    const moveX = gsap.quickTo(element, 'x', { duration: 0.28, ease: 'power3.out' });
    const moveY = gsap.quickTo(element, 'y', { duration: 0.28, ease: 'power3.out' });

    element.addEventListener('pointermove', (event) => {
      if (state.reducedMotion || !finePointer.matches) return;
      const rect = element.getBoundingClientRect();
      const x = Math.max(-6, Math.min(6, (event.clientX - rect.left - rect.width / 2) * 0.15));
      const y = Math.max(-6, Math.min(6, (event.clientY - rect.top - rect.height / 2) * 0.15));
      moveX(x);
      moveY(y);
    });

    element.addEventListener('pointerleave', () => {
      moveX(0);
      moveY(0);
    });
  }
}
