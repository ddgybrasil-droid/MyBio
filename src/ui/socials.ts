import { gsap } from 'gsap';
import { state, triggerBurst, type SocialId } from '../state';
import { scrollToElement } from './scroll';

type Phase = 'closed' | 'open' | 'closing';

interface SocialView {
  id: SocialId;
  wrapper: HTMLElement;
  trigger: HTMLButtonElement;
  details: HTMLElement;
  timeline: gsap.core.Timeline | null;
  phase: Phase;
  closedLabel: string;
  openLabel: string;
}

const OPEN_LABEL: Record<SocialId, string> = {
  discord: 'Закрыть Discord',
  telegram: 'Закрыть Telegram',
  tiktok: 'Закрыть TikTok',
};

function pointFor(element: Element, clientX?: number, clientY?: number): { x: number; y: number } {
  if (clientX && clientY) return { x: clientX, y: clientY };
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function panelAnchor(panel: HTMLElement, trigger: HTMLElement): { origin: string; sx: number; sy: number } {
  const card = panel.classList.contains('tiktok-card');
  const width = panel.offsetWidth || 56;
  const height = panel.offsetHeight || 56;
  const sx = Math.min(1, 56 / width);
  const sy = card ? Math.min(1, 56 / height) : 1;
  let ox = width - 28;
  let oy = card ? height - 28 : height / 2;
  const host = panel.offsetParent;
  if (host instanceof HTMLElement) {
    const hostRect = host.getBoundingClientRect();
    const puck = trigger.getBoundingClientRect();
    const puckCx = puck.left - hostRect.left - host.clientLeft + puck.width / 2;
    const puckCy = puck.top - hostRect.top - host.clientTop + puck.height / 2;
    ox = puckCx - panel.offsetLeft;
    oy = puckCy - panel.offsetTop;
  }
  return { origin: `${ox}px ${oy}px`, sx, sy };
}

function buildTimeline(view: SocialView): gsap.core.Timeline {
  const panel = view.details;
  const content = panel.querySelectorAll<HTMLElement>('p, a, button');
  const glint = panel.querySelector<HTMLElement>('.signal-glint');
  const anchor = panelAnchor(panel, view.trigger);
  const timeline = gsap.timeline({ paused: true });

  timeline
    .set(panel, { transformOrigin: anchor.origin }, 0)
    .fromTo(
      panel,
      { autoAlpha: 0, scaleX: anchor.sx, scaleY: anchor.sy },
      { autoAlpha: 1, scaleX: 1, scaleY: 1, duration: 0.36, ease: 'power3.inOut' },
      0,
    )
    .set(content, { autoAlpha: 0 }, 0)
    .to(content, { autoAlpha: 1, duration: 0.2, stagger: 0.04, ease: 'power2.out' }, 0.14);

  if (glint) {
    timeline.set(glint, { xPercent: -160 }, 0).to(glint, { xPercent: 420, duration: 0.52, ease: 'power1.inOut' }, 0.1);
  }

  return timeline;
}

export function initSocials(): void {
  const status = document.querySelector<HTMLElement>('[data-social-status]');
  const fallback = document.querySelector<HTMLInputElement>('[data-clipboard-fallback]');
  const views = new Map<SocialId, SocialView>();
  let openId: SocialId | null = null;

  const announce = (message: string): void => {
    if (status) status.textContent = message;
  };

  const copyText = async (value: string, message: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      announce(message);
      return;
    } catch {
      if (!fallback) {
        announce(`Скопируйте вручную: ${value}`);
        return;
      }
      fallback.value = value;
      fallback.select();
      fallback.setSelectionRange(0, value.length);
      try {
        const copied = document.execCommand('copy');
        announce(copied ? message : `Скопируйте вручную: ${value}`);
      } catch {
        announce(`Скопируйте вручную: ${value}`);
      }
    }
  };

  const showDiscordCopied = (): void => {
    const copyLabel = document.querySelector<HTMLElement>('[data-copy-label]');
    if (!copyLabel) return;
    copyLabel.textContent = 'Скопировано';
    window.setTimeout(() => {
      copyLabel.textContent = 'Скопировать';
    }, 1800);
  };

  const clearMotion = (view: SocialView): void => {
    const nodes: Element[] = [view.details, ...view.details.querySelectorAll('p, a, button, .signal-glint')];
    gsap.set(nodes, { clearProps: 'all' });
  };

  const setClosedSemantics = (view: SocialView): void => {
    view.wrapper.classList.remove('is-open');
    view.trigger.setAttribute('aria-expanded', 'false');
    view.trigger.setAttribute('aria-label', view.closedLabel);
    view.details.setAttribute('inert', '');
    if (openId === view.id) {
      openId = null;
      state.activeSocial = null;
    }
  };

  const finishClose = (view: SocialView): void => {
    if (view.phase !== 'closing') return;
    view.timeline?.kill();
    view.timeline = null;
    view.phase = 'closed';
    setClosedSemantics(view);
    clearMotion(view);
  };

  const closeView = (view: SocialView, returnFocus: boolean): void => {
    if (view.phase !== 'open') return;
    view.phase = 'closing';
    const timeline = view.timeline;
    const canReverse = !state.reducedMotion && timeline !== null && timeline.totalProgress() > 0.02;
    if (canReverse && timeline) {
      timeline.eventCallback('onReverseComplete', () => {
        timeline.eventCallback('onReverseComplete', null);
        finishClose(view);
      });
      timeline.timeScale(1.25).reverse();
    } else {
      finishClose(view);
    }
    if (returnFocus) view.trigger.focus({ preventScroll: true });
  };

  const closeOthers = (except: SocialId): void => {
    views.forEach((view) => {
      if (view.id !== except) closeView(view, false);
    });
  };

  const showInstant = (view: SocialView): void => {
    view.timeline?.pause(0);
    gsap.set(view.details, { autoAlpha: 1, scaleX: 1, scaleY: 1 });
    gsap.set(view.details.querySelectorAll('p, a, button'), { autoAlpha: 1, x: 0 });
  };

  const openView = (view: SocialView, clientX?: number, clientY?: number): void => {
    if (view.phase === 'open') return;
    const interrupting = view.phase === 'closing';
    closeOthers(view.id);
    const point = pointFor(view.trigger, clientX, clientY);
    triggerBurst(view.id, point.x, point.y);
    state.activeSocial = view.id;
    openId = view.id;
    view.phase = 'open';
    view.wrapper.classList.add('is-open');
    view.trigger.setAttribute('aria-expanded', 'true');
    view.trigger.setAttribute('aria-label', view.openLabel);
    view.details.removeAttribute('inert');

    if (state.reducedMotion) {
      showInstant(view);
      return;
    }

    if (!interrupting || !view.timeline) {
      view.timeline?.kill();
      view.timeline = buildTimeline(view);
    }
    const timeline = view.timeline;
    timeline.eventCallback('onReverseComplete', null);
    timeline.timeScale(1);
    if (interrupting && timeline.reversed() && timeline.totalProgress() > 0) timeline.play();
    else timeline.play(0);
  };

  document.querySelectorAll<HTMLElement>('[data-social-reveal]').forEach((wrapper) => {
    const id = wrapper.dataset.socialReveal as SocialId;
    const trigger = wrapper.querySelector<HTMLButtonElement>(`[data-social-trigger="${id}"]`);
    const details = wrapper.querySelector<HTMLElement>('[data-social-details]');
    if (!trigger || !details) return;

    const view: SocialView = {
      id,
      wrapper,
      trigger,
      details,
      timeline: null,
      phase: 'closed',
      closedLabel: trigger.getAttribute('aria-label') ?? OPEN_LABEL[id],
      openLabel: OPEN_LABEL[id],
    };
    views.set(id, view);

    trigger.addEventListener('click', (event) => {
      if (view.phase === 'open') {
        closeView(view, true);
        return;
      }
      if (id === 'discord') {
        void copyText('ascend_s7', 'Discord: ascend_s7 скопирован');
        showDiscordCopied();
      }
      openView(view, event.clientX, event.clientY);
    });

    wrapper.addEventListener('pointerenter', () => {
      state.activeSocial = id;
    });
    wrapper.addEventListener('pointerleave', () => {
      if (openId !== id) state.activeSocial = null;
    });
    wrapper.addEventListener('focusin', () => {
      state.activeSocial = id;
    });
    wrapper.addEventListener('focusout', (event) => {
      if (openId !== id && !(event.relatedTarget instanceof Node && wrapper.contains(event.relatedTarget))) {
        state.activeSocial = null;
      }
    });

    wrapper.querySelectorAll<HTMLButtonElement>('[data-social-close]').forEach((button) => {
      button.addEventListener('click', () => closeView(view, true));
    });
  });

  document.querySelector<HTMLButtonElement>('[data-copy-discord]')?.addEventListener('click', () => {
    void copyText('ascend_s7', 'Discord: ascend_s7 скопирован');
    showDiscordCopied();
  });
  document.querySelector<HTMLButtonElement>('[data-copy-tiktok]')?.addEventListener('click', () => {
    void copyText('@tg.abouthard', 'TikTok: @tg.abouthard скопирован');
  });
  document.querySelector<HTMLButtonElement>('[data-footer-copy]')?.addEventListener('click', () => {
    void copyText('ascend_s7', 'Discord: ascend_s7 скопирован');
  });

  document.querySelectorAll<HTMLButtonElement>('[data-hero-social]').forEach((button) => {
    const id = button.dataset.heroSocial as SocialId;
    button.addEventListener('pointerenter', () => {
      state.activeSocial = id;
    });
    button.addEventListener('pointerleave', () => {
      if (openId !== id) state.activeSocial = null;
    });
    button.addEventListener('focus', () => {
      state.activeSocial = id;
    });
    button.addEventListener('blur', () => {
      if (openId !== id) state.activeSocial = null;
    });
    button.addEventListener('click', (event) => {
      const contact = document.getElementById('contact');
      const view = views.get(id);
      const point = pointFor(button, event.clientX, event.clientY);
      triggerBurst(id, point.x, point.y);
      state.activeSocial = id;
      if (!contact || !view) return;
      scrollToElement(contact, () => {
        openView(view);
        view.trigger.focus({ preventScroll: true });
      });
    });
  });

  document.addEventListener('pointerdown', (event) => {
    if (!openId) return;
    const view = views.get(openId);
    if (!view || (event.target instanceof Node && view.wrapper.contains(event.target))) return;
    closeView(view, false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !openId) return;
    event.preventDefault();
    const view = views.get(openId);
    if (view) closeView(view, true);
  });
}
