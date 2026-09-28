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

  refreshOnAsyncLayout();
}

/** The lab and specimen hosts are filled after boot, which moves every trigger below them. */
function refreshOnAsyncLayout(): void {
  const hosts = document.querySelectorAll<HTMLElement>('[data-lab-root], [data-specimen-card]');
  if (!hosts.length || typeof ResizeObserver === 'undefined') return;

  const heights = new WeakMap<Element, number>();
  let timer = 0;
  const observer = new ResizeObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      const height = Math.round(entry.contentRect.height);
      if (heights.get(entry.target) !== height) {
        heights.set(entry.target, height);
        changed = true;
      }
    }
    if (!changed) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => ScrollTrigger.refresh(), 180);
  });
  hosts.forEach((host) => observer.observe(host));
}
