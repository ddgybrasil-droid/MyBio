import { state } from '../state';
import { claim, othersRunning, register, type Runnable } from './bus';
import { button, h, nextId } from './dom';
import { CodeEditor } from './editor';
import { buildStandaloneHtml, downloadText } from './export';
import { bindFullscreenButton } from './fullscreen';
import { GlRunner, type CompileError } from './gl-runner';
import { presets, type Preset } from './presets';
import { copyText, decodeShader, readShareHash, shareSupported, writeShareHash } from './share';

const COMPILE_DELAY = 600;
const SHARED_ID = 'shared';
const STILL_TIME = 2.4;

export interface Piece {
  el: HTMLElement;
  dispose(): void;
}

function describeErrors(errors: CompileError[]): string {
  const shown = errors.slice(0, 4).map((e) => (e.line ? `Строка ${e.line}: ${e.message}` : e.message));
  const rest = errors.length - shown.length;
  return shown.join('\n') + (rest > 0 ? `\n…и ещё ${rest}` : '');
}

export function createShaderBench(): Piece {
  const autoplay = !state.reducedMotion && state.tier > 0;
  const titleId = nextId('lab-bench-title');
  const hintId = nextId('lab-bench-hint');
  const buffers = new Map<string, string>(presets.map((p) => [p.id, p.code]));
  let current: Preset = presets[0] as Preset;
  let currentId = current.id;
  let sharedTitle = 'Шейдер по ссылке';
  let compileTimer = 0;
  let lastLog = '';
  let visible = false;
  let everVisible = false;
  let started = false;
  let disposed = false;

  /* ---------- DOM ---------- */
  const canvas = h('canvas', { class: 'lab-bench__canvas', 'aria-hidden': 'true' });
  const coverText = h('p', { class: 'lab-cover__text' });
  const coverRun = button('Запустить', {}, 'lab-btn--primary');
  const cover = h('div', { class: 'lab-cover' }, coverRun, coverText);
  const playBtn = button('Пауза', { 'aria-pressed': 'false' });
  const restartBtn = button('С начала');
  const fsBtn = button('Во весь экран');
  const fps = h('span', { class: 'lab-fps', 'aria-hidden': 'true' }, '—');
  const strip = h('div', { class: 'lab-strip', role: 'group', 'aria-label': 'Управление превью' }, playBtn, restartBtn, fps, fsBtn);
  const stage = h('div', { class: 'lab-stage lab-bench__stage', 'data-state': 'idle' }, canvas, cover, strip);
  const captionTitle = h('strong');
  const captionNote = h('span');
  const caption = h('p', { class: 'lab-bench__caption', 'aria-live': 'polite' }, captionTitle, captionNote);

  const presetGroup = h('div', { class: 'lab-presets__options' });
  const presetField = h(
    'fieldset',
    { class: 'lab-presets' },
    h('legend', { class: 'lab-visually-hidden' }, 'Пресет шейдера'),
    presetGroup,
  );
  const radioName = nextId('lab-preset');
  const radios = new Map<string, HTMLInputElement>();
  const addRadio = (id: string, label: string, prepend = false) => {
    const input = h('input', { type: 'radio', name: radioName, value: id, class: 'lab-presets__input' });
    const option = h('label', { class: 'lab-presets__option' }, input, h('span', null, label));
    input.addEventListener('change', () => {
      if (input.checked) selectPreset(id);
    });
    radios.set(id, input);
    if (prepend) presetGroup.prepend(option);
    else presetGroup.append(option);
  };
  presets.forEach((p) => addRadio(p.id, p.title));

  const editor = new CodeEditor({
    value: current.code,
    label: 'Код фрагментного шейдера, GLSL ES 3.00',
    describedBy: hintId,
    onChange(value) {
      buffers.set(currentId, value);
      window.clearTimeout(compileTimer);
      compileTimer = window.setTimeout(compileNow, COMPILE_DELAY);
    },
    onSubmit() {
      window.clearTimeout(compileTimer);
      compileNow();
    },
  });

  const hint = h(
    'p',
    { class: 'lab-hint', id: hintId },
    h('kbd', null, 'Ctrl/⌘ + Enter'), ' — компилировать сразу; правки компилируются сами через полсекунды. ',
    h('kbd', null, 'Tab'), ' — отступ. ',
    h('kbd', null, 'Esc'), ', затем ', h('kbd', null, 'Tab'), ' — выйти из редактора.',
  );

  const resetBtn = button('Сбросить пресет');
  const shareBtn = button('Скопировать ссылку');
  const downloadBtn = button('Скачать .html', {}, 'lab-btn--primary');
  const shareField = h('input', {
    class: 'lab-share-field',
    type: 'text',
    readonly: true,
    'aria-label': 'Ссылка на шейдер',
    hidden: true,
  });
  const log = h('p', { class: 'lab-log', role: 'status', 'aria-live': 'polite' });
  const actions = h('div', { class: 'lab-actions' }, resetBtn, shareBtn, downloadBtn);

  const uniforms = h(
    'dl',
    { class: 'lab-uniforms' },
    h('div', null, h('dt', null, 'iTime'), h('dd', null, 'секунды с запуска')),
    h('div', null, h('dt', null, 'iResolution'), h('dd', null, 'размер в пикселях')),
    h('div', null, h('dt', null, 'iMouse'), h('dd', null, 'xy — указатель, zw — нажатие')),
    h('div', null, h('dt', null, 'iFrame'), h('dd', null, 'номер кадра')),
  );

  const side = h('div', { class: 'lab-bench__side' }, presetField, editor.el, hint, actions, shareField, log);
  const el = h(
    'article',
    { class: 'lab-surface lab-bench', 'aria-labelledby': titleId },
    h(
      'header',
      { class: 'lab-surface__head' },
      h('div', null, h('p', { class: 'lab-index' }, '01 · GLSL'), h('h3', { class: 'lab-title', id: titleId }, 'Шейдерный стенд')),
      h(
        'p',
        { class: 'lab-lede' },
        'Фрагментный шейдер в формате Shadertoy компилируется прямо в браузере. Код исполняется только на видеокарте и не видит страницу, поэтому его можно смело править, делиться ссылкой и скачивать готовым файлом.',
      ),
    ),
    h('div', { class: 'lab-bench__main' }, h('div', { class: 'lab-bench__view' }, stage, caption, uniforms), side),
  );

  /* ---------- Runner ---------- */
  const runner = new GlRunner(canvas, {
    maxDpr: state.tier >= 2 ? 1.5 : 1,
    smoothPointer: !state.reducedMotion,
    onStats(rate, w, hgt) {
      fps.textContent = runner.isPlaying && rate > 0 ? `${Math.round(rate)} FPS · ${w}×${hgt}` : `ПАУЗА · ${w}×${hgt}`;
    },
    onContext(kind) {
      setLog(kind === 'lost' ? 'Контекст WebGL потерян. Ждём, пока браузер его вернёт.' : 'Контекст WebGL восстановлен.');
      stage.dataset.state = kind === 'lost' ? 'lost' : runner.isPlaying ? 'running' : 'paused';
    },
    onFirstFrame() {
      stage.classList.add('is-live');
    },
  });

  const piece: Runnable = {
    yield() {
      if (runner.isPlaying) pause();
    },
    isRunning: () => runner.isPlaying,
  };
  const unregister = register(piece);

  function setLog(text: string, isError = false): void {
    log.classList.toggle('is-error', isError);
    if (text === lastLog) return;
    lastLog = text;
    log.textContent = text;
  }

  function syncControls(): void {
    const playing = runner.isPlaying;
    playBtn.textContent = playing ? 'Пауза' : 'Запустить';
    playBtn.setAttribute('aria-pressed', String(!playing));
    playBtn.classList.toggle('lab-btn--primary', !playing);
    stage.dataset.state = playing ? 'running' : 'paused';
    if (playing) started = true;
    cover.hidden = runner.supported ? started : false;
    if (!playing) fps.textContent = `ПАУЗА · ${canvas.width}×${canvas.height}`;
  }

  function play(): void {
    if (!runner.supported) return;
    claim(piece);
    runner.play();
    syncControls();
  }

  function pause(): void {
    runner.pause();
    syncControls();
  }

  function compileNow(): void {
    if (disposed) return;
    const code = editor.value;
    const started = performance.now();
    const result = runner.compile(code);
    if (result.ok) {
      editor.setErrors([]);
      const ms = Math.max(1, Math.round(performance.now() - started));
      setLog(`Скомпилировано за ${ms} мс · ${code.split('\n').length} строк.`);
    } else {
      const lines = result.errors.map((e) => e.line).filter((n): n is number => n !== null);
      editor.setErrors(lines);
      setLog(`${describeErrors(result.errors)}\nНа превью — последний удачный вариант.`, true);
    }
  }

  function setCaption(): void {
    if (currentId === SHARED_ID) {
      captionTitle.textContent = sharedTitle;
      captionNote.textContent = 'Код загружен из ссылки; пресеты остались без изменений.';
    } else {
      captionTitle.textContent = current.title;
      captionNote.textContent = current.note;
    }
  }

  function selectPreset(id: string): void {
    if (id === currentId) return;
    buffers.set(currentId, editor.value);
    currentId = id;
    const preset = presets.find((p) => p.id === id);
    if (preset) current = preset;
    resetBtn.disabled = id === SHARED_ID;
    editor.value = buffers.get(id) ?? preset?.code ?? '';
    setCaption();
    runner.resetTime(runner.isPlaying ? 0 : STILL_TIME);
    window.clearTimeout(compileTimer);
    compileNow();
  }

  /* ---------- Events ---------- */
  const offFullscreen = bindFullscreenButton(stage, fsBtn);
  coverRun.addEventListener('click', () => {
    play();
    playBtn.focus({ preventScroll: true });
  });
  playBtn.addEventListener('click', () => (runner.isPlaying ? pause() : play()));
  restartBtn.addEventListener('click', () => runner.resetTime(runner.isPlaying ? 0 : STILL_TIME));

  resetBtn.addEventListener('click', () => {
    const preset = presets.find((p) => p.id === currentId);
    if (!preset) return;
    buffers.set(preset.id, preset.code);
    editor.value = preset.code;
    runner.resetTime(runner.isPlaying ? 0 : STILL_TIME);
    compileNow();
    setLog(`Пресет «${preset.title}» восстановлен.`);
  });

  shareBtn.addEventListener('click', async () => {
    if (!shareSupported()) {
      setLog('Этот браузер не умеет сжимать данные (CompressionStream), ссылку собрать не получится.', true);
      return;
    }
    try {
      const url = await writeShareHash(editor.value);
      shareField.value = url;
      if (await copyText(url)) {
        shareField.hidden = true;
        setLog(`Ссылка скопирована · ${url.length} символов.`);
      } else {
        shareField.hidden = false;
        shareField.focus();
        shareField.select();
        setLog('Буфер обмена недоступен — ссылка выделена в поле, скопируйте её вручную.');
      }
    } catch {
      setLog('Не удалось собрать ссылку.', true);
    }
  });

  downloadBtn.addEventListener('click', () => {
    const title = currentId === SHARED_ID ? sharedTitle : current.title;
    const slug = currentId === SHARED_ID ? 'shared' : current.id;
    downloadText(`s7-shader-${slug}.html`, buildStandaloneHtml(editor.value, title));
    setLog(`Файл s7-shader-${slug}.html собран: откройте его двойным щелчком.`);
  });

  const updateActive = () => runner.setActive(visible && !document.hidden);
  const io = new IntersectionObserver(
    (entries) => {
      visible = entries.some((e) => e.isIntersecting);
      updateActive();
      if (visible && !everVisible) {
        everVisible = true;
        if (autoplay && runner.supported && !othersRunning(piece)) {
          runner.play();
          syncControls();
        }
      }
    },
    { rootMargin: '120px 0px' },
  );
  io.observe(stage);
  document.addEventListener('visibilitychange', updateActive);

  /* ---------- Initial state ---------- */
  (radios.get(currentId) as HTMLInputElement).checked = true;
  setCaption();
  if (!runner.supported) {
    stage.dataset.state = 'unsupported';
    cover.hidden = false;
    coverRun.hidden = true;
    coverText.textContent = 'WebGL2 недоступен в этом браузере. Код можно править и скачать — файл запустится там, где WebGL2 есть.';
    playBtn.disabled = true;
    restartBtn.disabled = true;
    setLog('Превью отключено: нет WebGL2.');
  } else {
    coverText.textContent = state.reducedMotion
      ? 'Анимация на паузе: в системе включено уменьшение движения. Показан один кадр.'
      : 'Превью на паузе. Показан один кадр.';
    runner.resetTime(STILL_TIME);
    compileNow();
    syncControls();
  }

  const shared = readShareHash();
  if (shared && shareSupported()) {
    decodeShader(shared)
      .then((code) => {
        if (disposed) return;
        sharedTitle = 'Шейдер по ссылке';
        buffers.set(SHARED_ID, code);
        addRadio(SHARED_ID, 'По ссылке', true);
        (radios.get(SHARED_ID) as HTMLInputElement).checked = true;
        selectPreset(SHARED_ID);
        el.closest('section')?.scrollIntoView({ block: 'start' });
      })
      .catch(() => setLog('Ссылка повреждена: код не удалось распаковать.', true));
  }

  return {
    el,
    dispose() {
      disposed = true;
      window.clearTimeout(compileTimer);
      io.disconnect();
      document.removeEventListener('visibilitychange', updateActive);
      offFullscreen();
      unregister();
      editor.dispose();
      runner.dispose();
    },
  };
}
