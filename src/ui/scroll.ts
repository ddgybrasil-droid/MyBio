import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { state, type SectionId } from '../state';

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;
let lastScrollY = window.scrollY;
let tickerAttached = false;

const sectionIds: SectionId[] = ['hero', 'about', 'work', 'lab', 'contact'];

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function syncSceneState(): void {
  const viewportHeight = Math.max(window.innerHeight, 1);
  const maxScroll = Math.max(document.documentElement.scrollHeight - viewportHeight, 1);
  const currentScrollY = window.scrollY;
  const frameDelta = currentScrollY - lastScrollY;

  state.scroll = clamp(currentScrollY / maxScroll);
  state.velocity += (frameDelta - state.velocity) * 0.14;
  lastScrollY = currentScrollY;

  for (const id of sectionIds) {
    const section = document.getElementById(id);
    if (!section) continue;
    const rect = section.getBoundingClientRect();
    state.section[id] = clamp((viewportHeight - rect.top) / (viewportHeight + rect.height));
  }

  const work = document.getElementById('work');
  if (work) {
    const rect = work.getBoundingClientRect();
    const top = rect.top;
    // Start while Work is still just below the fold; finish before the heading owns the frame.
    const releaseStart = viewportHeight * 1.02;
    const releaseEnd = viewportHeight * 0.5;
    const enter = clamp((releaseStart - top) / Math.max(1, releaseStart - releaseEnd));
    // Drop the release once Work has scrolled away, so lab/contact can have the optic again.
    const stillCovering = clamp(rect.bottom / (viewportHeight * 0.42));
    state.handoff = enter * stillCovering;
    const entering = clamp((viewportHeight * 0.58 - top) / (viewportHeight * 0.36));
    const leaving = clamp(rect.bottom / viewportHeight);
    state.dark = Math.min(entering, leaving);
  } else {
    state.handoff = 0;
    state.dark = 0;
  }
}

function createLenis(): void {
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!finePointer || state.reducedMotion || lenis) return;

  lenis = new Lenis({
    smoothWheel: true,
    syncTouch: false,
    touchMultiplier: 1,
    wheelMultiplier: 0.86,
    lerp: 0.085,
  });
  lenis.on('scroll', ScrollTrigger.update);
}

function destroyLenis(): void {
  lenis?.destroy();
  lenis = null;
}

function ticker(time: number): void {
  lenis?.raf(time * 1000);
  syncSceneState();
}

export function scrollToElement(target: Element, onComplete?: () => void): void {
  if (lenis && !state.reducedMotion) {
    lenis.scrollTo(target as HTMLElement, {
      offset: -56,
      duration: 1.05,
      onComplete,
    });
    return;
  }

  target.scrollIntoView({
    behavior: state.reducedMotion ? 'auto' : 'smooth',
    block: 'start',
  });
  window.setTimeout(() => onComplete?.(), state.reducedMotion ? 0 : 650);
}

export function initScroll(): void {
  gsap.ticker.lagSmoothing(0);
  if (!tickerAttached) {
    gsap.ticker.add(ticker);
    tickerAttached = true;
  }

  createLenis();
  syncSceneState();

  document.addEventListener('s7:motion-change', () => {
    destroyLenis();
    createLenis();
    ScrollTrigger.refresh();
  });

  window.addEventListener('resize', syncSceneState, { passive: true });
  window.addEventListener('pageshow', syncSceneState, { passive: true });
}
