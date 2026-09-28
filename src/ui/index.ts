import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initCursor } from './cursor';
import { initNav } from './nav';
import { initReveals } from './reveal';
import { initScroll } from './scroll';
import { initSocials } from './socials';
import { initSpecimenChamber } from './specimens-chamber';

export function initUI(): void {
  initNav();
  initScroll();
  initReveals();
  initSpecimenChamber();
  initSocials();
  initCursor();

  void document.fonts.ready.then(() => {
    ScrollTrigger.refresh();
  });
}
