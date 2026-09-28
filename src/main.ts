import '@fontsource-variable/onest';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/tokens.css';
import './styles/main.css';

import { state, type Tier } from './state';
import { initUI } from './ui';

function detectTier(): Tier {
  const params = new URLSearchParams(location.search);
  const forced = params.get('tier');
  if (forced === '0' || forced === '1' || forced === '2') return Number(forced) as Tier;

  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2');
  if (!gl) return 0;
  gl.getExtension('WEBGL_lose_context')?.loseContext();

  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return 0;
  if (sessionStorage.getItem('s7-context-lost') === '1') return 0;

  const coarse = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (coarse || cores <= 4 || window.innerWidth < 900) return 1;
  return 2;
}

const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
state.reducedMotion = motionQuery.matches;
state.tier = detectTier();

const root = document.documentElement;
root.dataset.tier = String(state.tier);
root.classList.toggle('reduced-motion', state.reducedMotion);
root.classList.add('js');

motionQuery.addEventListener('change', (event) => {
  state.reducedMotion = event.matches;
  root.classList.toggle('reduced-motion', event.matches);
});

initUI();

async function bootWebGL(): Promise<void> {
  const { initSpecimens } = await import('./scene/specimens');
  initSpecimens(document);

  if (state.tier === 0) return;
  const canvas = document.getElementById('lens-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) return;

  canvas.addEventListener('webglcontextlost', () => {
    sessionStorage.setItem('s7-context-lost', '1');
  });

  const { initLensScene } = await import('./scene/lens');
  initLensScene(canvas);
  root.classList.add('webgl-ready');
}

async function bootLab(): Promise<void> {
  const { initLab } = await import('./lab');
  initLab(document);
}

const idle = (cb: () => void): void => {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(cb, { timeout: 600 });
  else globalThis.setTimeout(cb, 120);
};

idle(() => {
  void bootWebGL();
  void bootLab();
});
