import './specimens.css';
import type { SpecimenKind } from '../content';
import { state } from '../state';
import type { SpecimenSlot } from './viewer';

const KINDS: readonly SpecimenKind[] = ['lens', 'knot', 'relief'];
const FALLBACK_FILE: Record<SpecimenKind, string> = {
  lens: 's7-split-lens.glb',
  knot: 'chromatic-knot.glb',
  relief: 'contour-relief.glb',
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}\u00a0КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')}\u00a0МБ`;
}

function say(status: HTMLElement | null, text: string): void {
  if (status) status.textContent = text;
}

async function download(kind: SpecimenKind, file: string, button: HTMLButtonElement, status: HTMLElement | null): Promise<void> {
  if (button.getAttribute('aria-busy') === 'true') return;
  button.setAttribute('aria-busy', 'true');
  say(status, 'Готовлю .glb…');
  try {
    const { exportSpecimenGLB } = await import('./export');
    const buffer = await exportSpecimenGLB(kind);
    const blob = new Blob([buffer], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file;
    link.rel = 'noopener';
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    say(status, `Скачано: ${file} · ${formatSize(blob.size)}`);
  } catch {
    say(status, 'Не удалось собрать .glb. Попробуйте ещё раз.');
  } finally {
    button.removeAttribute('aria-busy');
  }
}

/**
 * Wires every `[data-specimen-card]`. Downloads work on every tier (the model is
 * built without a renderer); viewers mount only when WebGL is available (tier ≥ 1).
 */
export function initSpecimens(root: ParentNode): void {
  const webgl = state.tier > 0;
  const slots: SpecimenSlot[] = [];

  root.querySelectorAll<HTMLElement>('[data-specimen-card]').forEach((card) => {
    if (card.dataset.specimenReady === '1') return;
    const kind = card.dataset.kind as SpecimenKind;
    if (!KINDS.includes(kind)) return;
    card.dataset.specimenReady = '1';

    const status = card.querySelector<HTMLElement>('[data-specimen-status]');
    const stage = card.querySelector<HTMLElement>('[data-specimen]');
    const wireButton = card.querySelector<HTMLButtonElement>('[data-specimen-action="wireframe"]');
    const resetButton = card.querySelector<HTMLButtonElement>('[data-specimen-action="reset"]');
    const downloadButton = card.querySelector<HTMLButtonElement>('[data-specimen-action="download"]');

    if (downloadButton) {
      const file = downloadButton.dataset.file || FALLBACK_FILE[kind];
      downloadButton.addEventListener('click', () => void download(kind, file, downloadButton, status));
    }

    if (!webgl || !stage) {
      if (wireButton) wireButton.disabled = true;
      if (resetButton) resetButton.disabled = true;
      return;
    }

    const slot: SpecimenSlot = { kind, stage, wireframe: wireButton?.getAttribute('aria-pressed') === 'true' };
    slots.push(slot);

    wireButton?.addEventListener('click', () => {
      slot.wireframe = !slot.wireframe;
      wireButton.setAttribute('aria-pressed', String(slot.wireframe));
      slot.viewer?.setWireframe(slot.wireframe);
      slot.viewer?.onInteract();
    });
    resetButton?.addEventListener('click', () => {
      slot.viewer?.reset();
      slot.viewer?.onInteract();
    });
  });

  if (!slots.length) return;
  void import('./viewer')
    .then(({ SpecimenScheduler }) => new SpecimenScheduler(slots).wake())
    .catch(() => undefined);
}
