import { claim, register, type Runnable } from './bus';
import { button, formatBytes, h, nextId } from './dom';
import { bindFullscreenButton } from './fullscreen';
import { highlight } from './glsl-highlight';
import { clothPoster, lamellaeFieldPoster, liquidGlassPoster } from './posters';
import type { Piece } from './shader-bench';
import { copyText } from './share';

type Layout = 'stage-left' | 'stage-right' | 'stage-wide';
type RunState = 'idle' | 'loading' | 'running' | 'paused' | 'error';

interface Experiment {
  file: string;
  index: string;
  title: string;
  premise: string;
  tech: string[];
  controls: string;
  layout: Layout;
  poster(): SVGSVGElement;
}

const EXPERIMENTS: Experiment[] = [
  {
    file: 'liquid-glass.html',
    index: '02 · Three.js',
    title: 'Жидкое стекло',
    premise:
      'Капля толстого стекла с дисперсией. Вершины смещаются трёхмерным шумом прямо в шейдере материала, а инерция движения вытягивает каплю вслед за указателем. Сквозь неё видны линованный лист и семь алюминиевых ламелей — преломление настоящее, через проход прозрачности three.js.',
    tech: ['MeshPhysicalMaterial: transmission, dispersion', 'onBeforeCompile, 3D-шум, пересчёт нормалей', 'RoomEnvironment · PMREM · Neutral tone mapping'],
    controls: 'Ведите указателем — капля тянется следом. Нажатие — упругий импульс.',
    layout: 'stage-left',
    poster: liquidGlassPoster,
  },
  {
    file: 'lamellae-field.html',
    index: '03 · Three.js',
    title: 'Магнитные ламели',
    premise:
      'Тысячи тонких алюминиевых пластин стоят на листе, как железные опилки. Указатель несёт магнитный диполь, а каждая пластина — пружинный маятник: она доворачивается вдоль силовой линии с запаздыванием и приподнимается там, где поле сильнее. Всё поле — один InstancedMesh и один вызов отрисовки.',
    tech: ['InstancedMesh, один draw call', 'Поле диполя, пружинная динамика', 'Мягкие тени · RoomEnvironment'],
    controls: 'Ведите указателем — это магнит. Зажмите — усилить поле. Пробел — повернуть магнит.',
    layout: 'stage-right',
    poster: lamellaeFieldPoster,
  },
  {
    file: 'cloth.html',
    index: '04 · Three.js',
    title: 'Ткань',
    premise:
      'Полотно на штанге, посчитанное интегратором Верле: частицы, связи и пятнадцать проходов релаксации за шаг. Ткань можно схватить и потянуть; в режиме разрыва перерастянутые связи лопаются, и сетка перестраивается на лету.',
    tech: ['Интегратор Верле, разрыв связей', 'MeshPhysicalMaterial: sheen', 'Тени · RoomEnvironment'],
    controls: 'Тяните ткань указателем. T — режим разрыва, R — повесить заново.',
    layout: 'stage-wide',
    poster: clothPoster,
  },
];

const STATUS: Record<RunState, string> = {
  idle: 'Остановлено',
  loading: 'Загрузка…',
  running: 'Работает',
  paused: 'На паузе',
  error: 'Не запустилось',
};

interface LabMessage {
  source: 's7-lab';
  type: 'ready' | 'error';
  message?: string;
}

function isLabMessage(data: unknown): data is LabMessage {
  return typeof data === 'object' && data !== null && (data as { source?: unknown }).source === 's7-lab';
}

const sourceCache = new Map<string, Promise<string>>();
function fetchSource(url: string): Promise<string> {
  let pending = sourceCache.get(url);
  if (!pending) {
    pending = fetch(url).then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.text();
    });
    pending.catch(() => sourceCache.delete(url));
    sourceCache.set(url, pending);
  }
  return pending;
}

async function fetchSize(url: string): Promise<number> {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    const len = Number(head.headers.get('content-length'));
    if (head.ok && len > 0 && !head.headers.get('content-encoding')) return len;
  } catch {
    /* fall through to a full fetch */
  }
  const text = await fetchSource(url);
  return new Blob([text]).size;
}

class ExperimentView implements Runnable {
  readonly el: HTMLElement;
  private readonly exp: Experiment;
  private readonly url: string;
  private readonly stage: HTMLDivElement;
  private readonly poster: HTMLDivElement;
  private readonly strip: HTMLDivElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly status: HTMLParagraphElement;
  private readonly sizeEl: HTMLElement;
  private readonly sourceBtn: HTMLButtonElement;
  private readonly sourcePanel: HTMLDivElement;
  private readonly sourceCode: HTMLElement;
  private readonly sourceStatus: HTMLParagraphElement;
  private readonly cleanups: Array<() => void> = [];
  private iframe: HTMLIFrameElement | null = null;
  private runState: RunState = 'idle';
  private visible = false;
  private loadTimer = 0;
  private sizeRequested = false;

  constructor(exp: Experiment) {
    this.exp = exp;
    this.url = new URL(`lab/${exp.file}`, document.baseURI).href;
    const titleId = nextId('lab-exp-title');
    const sourceId = nextId('lab-exp-source');

    const runBtn = button('Запустить', { 'aria-describedby': titleId }, 'lab-btn--primary');
    this.poster = h(
      'div',
      { class: 'lab-poster' },
      exp.poster(),
      h('div', { class: 'lab-poster__run' }, runBtn, h('span', { class: 'lab-poster__note' }, 'Запуск загрузит three.js с jsDelivr')),
    );
    this.pauseBtn = button('Пауза', { 'aria-pressed': 'false' });
    const resetBtn = button('Сбросить');
    const fsBtn = button('Во весь экран');
    this.strip = h('div', { class: 'lab-strip', role: 'group', 'aria-label': `Управление: ${exp.title}`, hidden: true }, this.pauseBtn, resetBtn, fsBtn);
    this.stage = h('div', { class: 'lab-stage lab-exp__stage', 'data-state': 'idle' }, this.poster, this.strip);

    this.status = h('p', { class: 'lab-status', role: 'status', 'aria-live': 'polite' }, STATUS.idle);
    this.sizeEl = h('span', { class: 'lab-exp__size' }, '—');
    this.sourceBtn = button('Исходник', { 'aria-expanded': 'false', 'aria-controls': sourceId });
    const download = h('a', { class: 'lab-btn lab-btn--primary', href: this.url, download: exp.file }, 'Скачать');

    const specs = h(
      'dl',
      { class: 'lab-specs' },
      h('div', null, h('dt', null, 'Технологии'), h('dd', null, h('ul', { class: 'lab-tech' }, ...exp.tech.map((t) => h('li', null, t))))),
      h('div', null, h('dt', null, 'Управление'), h('dd', null, exp.controls)),
      h('div', null, h('dt', null, 'Файл'), h('dd', null, h('code', null, exp.file), ' · ', this.sizeEl, ' · MIT')),
      h('div', null, h('dt', null, 'Требуется'), h('dd', null, 'WebGL2, доступ к cdn.jsdelivr.net')),
    );

    const info = h(
      'div',
      { class: 'lab-exp__info' },
      h('header', { class: 'lab-exp__head' }, h('p', { class: 'lab-index' }, exp.index), h('h3', { class: 'lab-title', id: titleId }, exp.title)),
      h('p', { class: 'lab-exp__premise' }, exp.premise),
      specs,
      h('div', { class: 'lab-exp__foot' }, this.status, h('div', { class: 'lab-actions' }, this.sourceBtn, download)),
    );

    const copyBtn = button('Скопировать');
    const closeBtn = button('Свернуть');
    this.sourceCode = h('code');
    this.sourceStatus = h('p', { class: 'lab-source__status', role: 'status', 'aria-live': 'polite' });
    this.sourcePanel = h(
      'div',
      { class: 'lab-source', id: sourceId, hidden: true },
      h('div', { class: 'lab-source__bar' }, h('code', { class: 'lab-source__name' }, `public/lab/${exp.file}`), this.sourceStatus, copyBtn, closeBtn),
      h('pre', { class: 'lab-source__pre', tabindex: '0', 'aria-label': `Исходный код ${exp.file}` }, this.sourceCode),
    );

    this.el = h('article', { class: `lab-surface lab-exp lab-exp--${exp.layout}`, 'aria-labelledby': titleId }, this.stage, info, this.sourcePanel);

    runBtn.addEventListener('click', () => this.start());
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    resetBtn.addEventListener('click', () => this.reset());
    this.cleanups.push(bindFullscreenButton(this.stage, fsBtn));
    this.sourceBtn.addEventListener('click', () => this.toggleSource());
    closeBtn.addEventListener('click', () => {
      this.toggleSource(false);
      this.sourceBtn.focus();
    });
    copyBtn.addEventListener('click', () => void this.copySource());
    this.cleanups.push(register(this));
  }

  /** Lazily fetches the file size once the surface is near the viewport. */
  requestSize(): void {
    if (this.sizeRequested) return;
    this.sizeRequested = true;
    fetchSize(this.url)
      .then((bytes) => {
        this.sizeEl.textContent = formatBytes(bytes);
      })
      .catch(() => {
        this.sizeEl.textContent = 'размер неизвестен';
      });
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    if (visible) this.requestSize();
    if (this.runState === 'running') this.post(visible ? 'resume' : 'pause');
  }

  onMessage(event: MessageEvent): boolean {
    if (!this.iframe || event.source !== this.iframe.contentWindow || !isLabMessage(event.data)) return false;
    window.clearTimeout(this.loadTimer);
    if (event.data.type === 'ready') {
      this.stage.classList.add('is-live');
      if (this.runState === 'loading') this.setState('running');
      if (!this.visible || this.runState === 'paused') this.post('pause');
    } else {
      this.setState('error', event.data.message ?? 'Эксперименту не хватило возможностей браузера.');
    }
    return true;
  }

  yield(): void {
    if (this.runState === 'running' || this.runState === 'loading') {
      this.post('pause');
      this.setState('paused');
    }
  }

  isRunning(): boolean {
    return this.runState === 'running' || this.runState === 'loading';
  }

  dispose(): void {
    window.clearTimeout(this.loadTimer);
    this.destroyFrame();
    for (const fn of this.cleanups) fn();
  }

  private start(): void {
    claim(this);
    this.destroyFrame();
    const frame = h('iframe', {
      class: 'lab-exp__frame',
      src: this.url,
      title: `${this.exp.title} — интерактивный эксперимент`,
      sandbox: 'allow-scripts',
      referrerpolicy: 'no-referrer',
    });
    this.iframe = frame;
    this.stage.prepend(frame);
    this.stage.classList.remove('is-live');
    this.poster.hidden = true;
    this.strip.hidden = false;
    this.setState('loading');
    frame.focus({ preventScroll: true });
    this.loadTimer = window.setTimeout(() => {
      if (this.runState === 'loading') this.setState('error', 'Не дождались ответа. Проверьте доступ к cdn.jsdelivr.net и поддержку WebGL2.');
    }, 20000);
  }

  private togglePause(): void {
    if (this.runState === 'running') {
      this.post('pause');
      this.setState('paused');
    } else if (this.runState === 'paused') {
      claim(this);
      this.post('resume');
      this.setState(this.stage.classList.contains('is-live') ? 'running' : 'loading');
    }
  }

  private reset(): void {
    const hadFocus = this.stage.contains(document.activeElement);
    this.start();
    if (!hadFocus) this.pauseBtn.focus({ preventScroll: true });
  }

  private destroyFrame(): void {
    if (!this.iframe) return;
    this.iframe.src = 'about:blank';
    this.iframe.remove();
    this.iframe = null;
  }

  private post(type: 'pause' | 'resume'): void {
    this.iframe?.contentWindow?.postMessage({ type }, '*');
  }

  private setState(next: RunState, detail?: string): void {
    this.runState = next;
    this.stage.dataset.state = next;
    this.status.textContent = detail ? `${STATUS[next]}: ${detail}` : STATUS[next];
    this.status.classList.toggle('is-error', next === 'error');
    const paused = next === 'paused';
    this.pauseBtn.textContent = paused ? 'Продолжить' : 'Пауза';
    this.pauseBtn.setAttribute('aria-pressed', String(paused));
    this.pauseBtn.classList.toggle('lab-btn--primary', paused);
    this.pauseBtn.disabled = next === 'error';
  }

  private toggleSource(force?: boolean): void {
    const open = force ?? this.sourcePanel.hidden;
    this.sourcePanel.hidden = !open;
    this.sourceBtn.setAttribute('aria-expanded', String(open));
    this.sourceBtn.textContent = open ? 'Скрыть исходник' : 'Исходник';
    if (!open || this.sourceCode.childNodes.length) return;
    this.sourceStatus.textContent = 'Загрузка…';
    fetchSource(this.url)
      .then((text) => {
        this.sourceCode.innerHTML = highlight(text, 'js');
        const lines = text.split('\n').length;
        this.sourceStatus.textContent = `${lines} строк`;
        this.sizeEl.textContent = formatBytes(new Blob([text]).size);
      })
      .catch(() => {
        this.sourceStatus.textContent = 'Не удалось загрузить исходник.';
      });
  }

  private async copySource(): Promise<void> {
    try {
      const text = await fetchSource(this.url);
      const ok = await copyText(text);
      this.sourceStatus.textContent = ok ? 'Скопировано' : 'Буфер обмена недоступен — выделите код вручную.';
    } catch {
      this.sourceStatus.textContent = 'Не удалось загрузить исходник.';
    }
  }
}

export function createExperiments(): Piece {
  const views = EXPERIMENTS.map((exp) => new ExperimentView(exp));
  const el = h('div', { class: 'lab-experiments' }, ...views.map((v) => v.el));

  const onMessage = (event: MessageEvent) => {
    for (const view of views) if (view.onMessage(event)) break;
  };
  window.addEventListener('message', onMessage);

  const byStage = new Map<Element, ExperimentView>();
  views.forEach((view) => {
    const stage = view.el.querySelector('.lab-exp__stage');
    if (stage) byStage.set(stage, view);
  });
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) byStage.get(entry.target)?.setVisible(entry.isIntersecting && !document.hidden);
    },
    { rootMargin: '200px 0px' },
  );
  byStage.forEach((_, stage) => io.observe(stage));

  const onVisibility = () => {
    if (document.hidden) views.forEach((v) => v.setVisible(false));
    else byStage.forEach((view, stage) => view.setVisible(isOnScreen(stage)));
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    el,
    dispose() {
      io.disconnect();
      window.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisibility);
      views.forEach((v) => v.dispose());
    },
  };
}

function isOnScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > -200 && r.top < window.innerHeight + 200 && r.width > 0;
}
