export function fullscreenSupported(): boolean {
  return typeof document.documentElement.requestFullscreen === 'function' && document.fullscreenEnabled;
}

export async function toggleFullscreen(el: HTMLElement): Promise<void> {
  if (document.fullscreenElement === el) {
    await document.exitFullscreen();
  } else {
    await el.requestFullscreen({ navigationUI: 'hide' });
  }
}

/** Keeps a button label in sync with the element's fullscreen state. Returns an unsubscribe function. */
export function bindFullscreenButton(el: HTMLElement, btn: HTMLButtonElement): () => void {
  if (!fullscreenSupported()) {
    btn.hidden = true;
    return () => undefined;
  }
  const sync = () => {
    const active = document.fullscreenElement === el;
    btn.textContent = active ? 'Свернуть' : 'Во весь экран';
    btn.setAttribute('aria-pressed', String(active));
  };
  const onClick = () => {
    toggleFullscreen(el).catch(() => undefined);
  };
  btn.addEventListener('click', onClick);
  document.addEventListener('fullscreenchange', sync);
  sync();
  return () => {
    btn.removeEventListener('click', onClick);
    document.removeEventListener('fullscreenchange', sync);
  };
}
