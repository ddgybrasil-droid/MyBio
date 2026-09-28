import './lab.css';
import { createExperiments } from './experiments';
import { createShaderBench } from './shader-bench';

/**
 * Renders the Open Bench into `[data-lab-root]` (searched inside `root`, or `root` itself).
 * Safe to call more than once; later calls are ignored.
 */
export function initLab(root: ParentNode): void {
  const mount =
    root instanceof HTMLElement && root.matches('[data-lab-root]')
      ? root
      : root.querySelector<HTMLElement>('[data-lab-root]');
  if (!mount || mount.dataset.labReady === 'true') return;
  mount.dataset.labReady = 'true';
  mount.classList.add('lab');

  const bench = createShaderBench();
  const experiments = createExperiments();
  mount.replaceChildren(bench.el, experiments.el);

  window.addEventListener(
    'pagehide',
    (event) => {
      if (event.persisted) return;
      bench.dispose();
      experiments.dispose();
    },
    { once: true },
  );
}
