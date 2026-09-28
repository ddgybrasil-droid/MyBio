import { gsap } from 'gsap';
import { state, triggerBurst, type SocialId } from '../state';
import { scrollToElement } from './scroll';

interface SocialView {
  id: SocialId;
  wrapper: HTMLElement;
  trigger: HTMLButtonElement;
  details: HTMLElement;
  timeline: gsap.core.Timeline | null;
  ambient: gsap.core.Tween | null;
}

function pointFor(element: Element, clientX?: number, clientY?: number): { x: number; y: number } {
  if (clientX && clientY) return { x: clientX, y: clientY };
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
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

  const setClosedSemantics = (view: SocialView): void => {
    view.wrapper.classList.remove('is-open');
    view.trigger.setAttribute('aria-expanded', 'false');
    view.details.setAttribute('inert', '');
    view.ambient?.kill();
    view.ambient = null;
    if (openId === view.id) {
      openId = null;
      state.activeSocial = null;
    }
  };

  const closeView = (view: SocialView, returnFocus: boolean): void => {
    if (!view.wrapper.classList.contains('is-open')) return;
    if (view.timeline && !state.reducedMotion) {
      view.timeline.eventCallback('onReverseComplete', () => {
        setClosedSemantics(view);
        view.timeline?.eventCallback('onReverseComplete', null);
      });
      view.timeline.timeScale(1.65).reverse();
    } else {
      gsap.to(view.details, {
        autoAlpha: 0,
        duration: state.reducedMotion ? 0.1 : 0.16,
        onComplete: () => setClosedSemantics(view),
      });
    }
    if (returnFocus) view.trigger.focus({ preventScroll: true });
  };

  const closeOthers = (except: SocialId): void => {
    views.forEach((view) => {
      if (view.id !== except) closeView(view, false);
    });
  };

  const buildDiscordTimeline = (view: SocialView): gsap.core.Timeline => {
    const capsule = view.details;
    const group = view.trigger.querySelector<SVGGElement>('[data-icon-slices]');
    const originalPath = group?.querySelector<SVGPathElement>('path');
    if (group && originalPath && group.children.length === 1) {
      for (let index = 1; index < 7; index += 1) group.append(originalPath.cloneNode(true));
      [...group.querySelectorAll('path')].forEach((path, index) => {
        const top = (index / 7) * 100;
        const bottom = 100 - ((index + 1) / 7) * 100;
        gsap.set(path, { clipPath: `inset(${top}% 0 ${bottom}% 0)` });
      });
    }
    const slices = group ? [...group.querySelectorAll('path')] : [];
    const duration = state.reducedMotion ? 0.1 : 0.34;
    return gsap
      .timeline({ paused: true })
      .set(capsule, { visibility: 'visible' })
      .to(capsule, { autoAlpha: 1, scaleX: 1, duration, ease: 'power3.out' })
      .fromTo(
        slices,
        {
          x: (index: number) => (index % 2 ? 9 : -8),
          y: (index: number) => (index - 3) * 2,
        },
        {
          x: 0,
          y: 0,
          duration: state.reducedMotion ? 0.1 : 0.3,
          stagger: state.reducedMotion ? 0 : 0.025,
          ease: 'power3.out',
        },
        0.06,
      )
      .from(capsule.querySelectorAll('p, button'), { autoAlpha: 0, x: 10, duration: 0.2, stagger: 0.04 }, 0.14);
  };

  const buildTelegramTimeline = (view: SocialView): gsap.core.Timeline => {
    const capsule = view.details;
    const plane = view.trigger.querySelector<SVGPathElement>('[data-plane]');
    const trail = view.wrapper.querySelector<SVGPathElement>('.telegram-trail path');
    const duration = state.reducedMotion ? 0.1 : 0.34;
    const timeline = gsap
      .timeline({ paused: true })
      .set(capsule, { visibility: 'visible' })
      .to(capsule, { autoAlpha: 1, scaleX: 1, duration, ease: 'power3.out' });

    if (!state.reducedMotion) {
      timeline
        .to(trail, { strokeDashoffset: 0, duration: 0.38, ease: 'power2.out' }, 0)
        .to(plane, { x: 95, y: -38, rotate: 24, duration: 0.22, ease: 'power2.out' }, 0)
        .to(plane, { x: 232, y: 6, rotate: 6, duration: 0.24, ease: 'sine.inOut' }, 0.2)
        .to(plane, { x: 0, y: 0, rotate: 0, duration: 0.33, ease: 'power3.inOut' }, 0.43)
        .to(trail, { strokeDashoffset: -330, duration: 0.24, ease: 'power2.in' }, 0.5);
    }

    timeline.from(capsule.querySelectorAll('p, a'), { autoAlpha: 0, x: 12, duration: 0.2, stagger: 0.04 }, state.reducedMotion ? 0 : 0.42);
    return timeline;
  };

  const buildTikTokTimeline = (view: SocialView): gsap.core.Timeline => {
    const card = view.details;
    const glyphLayers = view.trigger.querySelectorAll<SVGPathElement>('[data-tiktok-glyph] path');
    const lamellae = card.querySelectorAll<HTMLElement>('.tiktok-lamellae i');
    const handle = card.querySelector<HTMLElement>('[data-tiktok-handle]');
    const duration = state.reducedMotion ? 0.1 : 0.4;

    if (handle && handle.children.length === 0) {
      const text = handle.textContent ?? '';
      handle.setAttribute('aria-label', text);
      handle.textContent = '';
      [...text].forEach((character) => {
        const span = document.createElement('span');
        span.textContent = character;
        span.setAttribute('aria-hidden', 'true');
        span.style.display = 'inline-block';
        handle.append(span);
      });
    }

    const timeline = gsap
      .timeline({ paused: true })
      .set(card, { visibility: 'visible' })
      .to(view.trigger, { scale: 0.94, duration: state.reducedMotion ? 0 : 0.09, ease: 'power2.out' })
      .to(
        card,
        {
          autoAlpha: 1,
          clipPath: 'inset(0% 0% 0% 0% round 28px 28px 6px 6px)',
          duration,
          ease: 'power4.inOut',
        },
        state.reducedMotion ? 0 : 0.08,
      )
      .to(
        lamellae,
        {
          scaleX: 1,
          duration: state.reducedMotion ? 0.1 : 0.3,
          stagger: state.reducedMotion ? 0 : 0.025,
          ease: 'power3.out',
        },
        0.1,
      )
      .to(
        view.trigger,
        {
          x: 18,
          y: 72,
          scale: 0.77,
          duration: state.reducedMotion ? 0 : 0.35,
          ease: 'power3.inOut',
        },
        0.12,
      )
      .fromTo(
        glyphLayers,
        {
          x: (index: number) => (index === 0 ? -4 : index === 1 ? 4 : 0),
        },
        {
          x: 0,
          duration: state.reducedMotion ? 0.1 : 0.28,
          ease: 'power3.out',
        },
        0.35,
      )
      .from(
        handle?.children ?? [],
        {
          autoAlpha: 0,
          x: (index: number) => (index % 2 ? 3 : -3),
          color: (index: number) => (index % 2 ? 'var(--brand-tiktok-red)' : 'var(--brand-tiktok-cyan)'),
          duration: state.reducedMotion ? 0.1 : 0.22,
          stagger: state.reducedMotion ? 0 : 0.028,
        },
        0.38,
      )
      .from(card.querySelectorAll('.mini-feed > div, .tiktok-card__actions'), { autoAlpha: 0, y: 12, duration: 0.24, stagger: 0.06 }, 0.48);

    return timeline;
  };

  const openView = (view: SocialView, clientX?: number, clientY?: number): void => {
    closeOthers(view.id);
    const point = pointFor(view.trigger, clientX, clientY);
    triggerBurst(view.id, point.x, point.y);
    state.activeSocial = view.id;
    openId = view.id;
    view.wrapper.classList.add('is-open');
    view.trigger.setAttribute('aria-expanded', 'true');
    view.details.removeAttribute('inert');

    view.timeline?.kill();
    if (view.id === 'discord') view.timeline = buildDiscordTimeline(view);
    if (view.id === 'telegram') view.timeline = buildTelegramTimeline(view);
    if (view.id === 'tiktok') view.timeline = buildTikTokTimeline(view);
    view.timeline?.play(0);

    if (view.id === 'tiktok' && !state.reducedMotion) {
      const feedLines = view.details.querySelectorAll<HTMLElement>('.mini-feed i');
      view.ambient = gsap.to(feedLines, {
        xPercent: (index: number) => (index % 2 ? 16 : -16),
        duration: 1.2,
        stagger: 0.035,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    }
  };

  document.querySelectorAll<HTMLElement>('[data-social-reveal]').forEach((wrapper) => {
    const id = wrapper.dataset.socialReveal as SocialId;
    const trigger = wrapper.querySelector<HTMLButtonElement>(`[data-social-trigger="${id}"]`);
    const details = wrapper.querySelector<HTMLElement>('[data-social-details]');
    if (!trigger || !details) return;

    const view: SocialView = { id, wrapper, trigger, details, timeline: null, ambient: null };
    views.set(id, view);

    trigger.addEventListener('click', (event) => {
      if (id === 'discord') {
        void copyText('ascend_s7', 'Discord: ascend_s7 скопирован');
        showDiscordCopied();
      }
      if (wrapper.classList.contains('is-open') && id !== 'discord') closeView(view, true);
      else openView(view, event.clientX, event.clientY);
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
