import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { state, type SectionId } from '../state';

interface SectionRecord {
  id: SectionId;
  element: HTMLElement;
  label: string;
}

const motionStorageKey = 's7-reduced-motion';

function storedMotionPreference(): boolean | null {
  try {
    const stored = localStorage.getItem(motionStorageKey);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    return null;
  }
  return null;
}

function persistMotionPreference(value: boolean): void {
  try {
    localStorage.setItem(motionStorageKey, String(value));
  } catch {
    // Storage can be unavailable in strict privacy modes; the current session still works.
  }
}

function applyMotionPreference(toggle: HTMLButtonElement | null, label: HTMLElement | null): void {
  document.documentElement.classList.toggle('reduced-motion', state.reducedMotion);
  toggle?.setAttribute('aria-pressed', String(state.reducedMotion));
  if (label) label.textContent = state.reducedMotion ? 'выкл' : 'вкл';
}

export function initNav(): void {
  const root = document.documentElement;
  const nav = document.querySelector<HTMLElement>('[data-optical-nav]');
  const currentLabel = document.querySelector<HTMLElement>('[data-current-section]');
  const sectionCount = document.querySelector<HTMLElement>('[data-section-count]');
  const progress = document.querySelector<HTMLElement>('[data-scroll-progress]');
  const ticks = [...document.querySelectorAll<HTMLAnchorElement>('[data-progress-tick]')];
  const motionToggle = document.querySelector<HTMLButtonElement>('[data-motion-toggle]');
  const motionLabel = document.querySelector<HTMLElement>('[data-motion-label]');
  const sectionElements = [...document.querySelectorAll<HTMLElement>('[data-section]')];
  const sections: SectionRecord[] = sectionElements.flatMap((element) => {
    const id = element.id as SectionId;
    if (!['hero', 'about', 'work', 'lab', 'contact'].includes(id)) return [];
    return [{ id, element, label: element.dataset.sectionLabel ?? id }];
  });

  const stored = storedMotionPreference();
  if (stored !== null) state.reducedMotion = stored;
  applyMotionPreference(motionToggle, motionLabel);

  const setActive = (index: number): void => {
    const section = sections[index];
    if (!section) return;
    if (currentLabel) currentLabel.textContent = section.label;
    if (sectionCount) {
      sectionCount.textContent = `${String(index + 1).padStart(2, '0')}—${String(sections.length).padStart(2, '0')}`;
    }
    ticks.forEach((tick, tickIndex) => {
      tick.classList.toggle('is-active', tickIndex === index);
      if (tickIndex === index) tick.setAttribute('aria-current', 'location');
      else tick.removeAttribute('aria-current');
    });
    nav?.classList.toggle('is-dark', section.id === 'work');
  };

  sections.forEach((section, index) => {
    ScrollTrigger.create({
      trigger: section.element,
      start: 'top 46%',
      end: 'bottom 46%',
      onEnter: () => setActive(index),
      onEnterBack: () => setActive(index),
    });
  });

  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => {
      progress?.style.setProperty('transform', `scaleX(${self.progress})`);
    },
  });

  motionToggle?.addEventListener('click', () => {
    state.reducedMotion = !state.reducedMotion;
    persistMotionPreference(state.reducedMotion);
    applyMotionPreference(motionToggle, motionLabel);
    root.dispatchEvent(new CustomEvent('s7:motion-change', { bubbles: true }));
  });

  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
    applyMotionPreference(motionToggle, motionLabel);
    root.dispatchEvent(new CustomEvent('s7:motion-change', { bubbles: true }));
  });

  setActive(0);
}
