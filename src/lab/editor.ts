import { h } from './dom';
import { highlightLines } from './glsl-highlight';

export interface EditorOptions {
  value: string;
  label: string;
  describedBy?: string;
  onChange(value: string): void;
  onSubmit(): void;
}

const INDENT = '  ';

export class CodeEditor {
  readonly el: HTMLDivElement;
  private readonly input: HTMLTextAreaElement;
  private readonly pre: HTMLPreElement;
  private readonly code: HTMLElement;
  private readonly marks: HTMLDivElement;
  private readonly gutter: HTMLDivElement;
  private readonly gutterInner: HTMLDivElement;
  private readonly opts: EditorOptions;
  private lineCount = 0;
  private errorLines = new Set<number>();
  private escapeArmed = false;
  private paintQueued = 0;

  constructor(opts: EditorOptions) {
    this.opts = opts;
    this.gutterInner = h('div', { class: 'lab-editor__gutter-inner' });
    this.gutter = h('div', { class: 'lab-editor__gutter', 'aria-hidden': 'true' }, this.gutterInner);
    this.code = h('code');
    this.marks = h('div', { class: 'lab-editor__marks' });
    this.pre = h('pre', { class: 'lab-editor__pre', 'aria-hidden': 'true' }, this.marks, this.code);
    this.input = h('textarea', {
      class: 'lab-editor__input',
      spellcheck: 'false',
      autocapitalize: 'off',
      autocomplete: 'off',
      autocorrect: 'off',
      wrap: 'off',
      'aria-label': opts.label,
      'aria-describedby': opts.describedBy,
      'data-gramm': 'false',
    });
    this.input.value = opts.value;
    this.el = h(
      'div',
      { class: 'lab-editor' },
      this.gutter,
      h('div', { class: 'lab-editor__code' }, this.pre, this.input),
    );

    this.input.addEventListener('input', this.onInput);
    this.input.addEventListener('keydown', this.onKeyDown);
    this.input.addEventListener('scroll', this.syncScroll, { passive: true });
    this.input.addEventListener('blur', () => {
      this.escapeArmed = false;
    });
    this.paint();
  }

  get value(): string {
    return this.input.value;
  }

  set value(next: string) {
    this.input.value = next;
    this.input.scrollTop = 0;
    this.input.scrollLeft = 0;
    this.errorLines.clear();
    this.paint();
    this.syncScroll();
  }

  setErrors(lines: Iterable<number>): void {
    this.errorLines = new Set(lines);
    this.paintGutter(true);
    this.paintMarks();
  }

  focus(): void {
    this.input.focus({ preventScroll: true });
  }

  dispose(): void {
    if (this.paintQueued) cancelAnimationFrame(this.paintQueued);
    this.input.removeEventListener('input', this.onInput);
    this.input.removeEventListener('keydown', this.onKeyDown);
    this.input.removeEventListener('scroll', this.syncScroll);
  }

  private readonly onInput = (): void => {
    if (!this.paintQueued) {
      this.paintQueued = requestAnimationFrame(() => {
        this.paintQueued = 0;
        this.paint();
      });
    }
    this.opts.onChange(this.input.value);
  };

  private readonly syncScroll = (): void => {
    this.pre.scrollTop = this.input.scrollTop;
    this.pre.scrollLeft = this.input.scrollLeft;
    this.gutterInner.style.transform = `translateY(${-this.input.scrollTop}px)`;
  };

  private paint(): void {
    const lines = highlightLines(this.input.value, 'glsl');
    // A trailing newline keeps the last (possibly empty) line as tall as the textarea's.
    this.code.innerHTML = lines.join('\n') + '\n';
    const changed = lines.length !== this.lineCount;
    this.lineCount = lines.length;
    this.paintGutter(changed);
    this.paintMarks();
    this.syncScroll();
  }

  private paintGutter(rebuild: boolean): void {
    if (rebuild) {
      const frag = document.createDocumentFragment();
      for (let i = 1; i <= this.lineCount; i += 1) {
        frag.append(h('span', { class: 'lab-editor__ln' }, String(i)));
      }
      this.gutterInner.replaceChildren(frag);
    }
    const nodes = this.gutterInner.children;
    for (let i = 0; i < nodes.length; i += 1) {
      nodes[i]?.classList.toggle('is-error', this.errorLines.has(i + 1));
    }
  }

  private paintMarks(): void {
    const frag = document.createDocumentFragment();
    for (const line of this.errorLines) {
      if (line < 1 || line > this.lineCount) continue;
      const mark = h('span', { class: 'lab-editor__mark' });
      mark.style.setProperty('--line', String(line - 1));
      frag.append(mark);
    }
    this.marks.replaceChildren(frag);
  }

  private insert(text: string, selectStart?: number, selectEnd?: number): void {
    const ta = this.input;
    ta.focus({ preventScroll: true });
    // execCommand keeps the native undo stack; setRangeText is the fallback.
    const ok = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
    if (!ok) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (selectStart !== undefined) ta.setSelectionRange(selectStart, selectEnd ?? selectStart);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const ta = this.input;
    if (event.key === 'Escape') {
      this.escapeArmed = true;
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.escapeArmed = false;
      this.opts.onSubmit();
      return;
    }
    if (event.key === 'Tab') {
      if (this.escapeArmed || event.altKey || event.ctrlKey || event.metaKey) {
        this.escapeArmed = false;
        return;
      }
      event.preventDefault();
      this.indent(event.shiftKey);
      return;
    }
    this.escapeArmed = false;
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.isComposing) {
      event.preventDefault();
      const value = ta.value;
      const start = ta.selectionStart;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const indent = /^[ \t]*/.exec(value.slice(lineStart, start))?.[0] ?? '';
      const before = value.slice(lineStart, start).trimEnd();
      const after = value.slice(ta.selectionEnd);
      if (before.endsWith('{') && /^[ \t]*\}/.test(after)) {
        const text = `\n${indent}${INDENT}\n${indent}`;
        const caret = start + 1 + indent.length + INDENT.length;
        this.insert(text, caret);
      } else {
        this.insert(`\n${indent}${before.endsWith('{') ? INDENT : ''}`);
      }
    }
  };

  private indent(outdent: boolean): void {
    const ta = this.input;
    const value = ta.value;
    const { selectionStart: start, selectionEnd: end } = ta;
    const multiLine = value.slice(start, end).includes('\n');
    if (!outdent && !multiLine) {
      this.insert(INDENT);
      return;
    }
    const blockStart = value.lastIndexOf('\n', start - 1) + 1;
    const endAdj = end > start && value[end - 1] === '\n' ? end - 1 : end;
    const nextBreak = value.indexOf('\n', endAdj);
    const blockEnd = nextBreak === -1 ? value.length : nextBreak;
    const lines = value.slice(blockStart, blockEnd).split('\n');
    let firstDelta = 0;
    let total = 0;
    const next = lines.map((line, i) => {
      let delta: number;
      let out: string;
      if (outdent) {
        const remove = /^( {1,2}|\t)/.exec(line)?.[0].length ?? 0;
        out = line.slice(remove);
        delta = -remove;
      } else {
        out = INDENT + line;
        delta = INDENT.length;
      }
      if (i === 0) firstDelta = delta;
      total += delta;
      return out;
    });
    ta.setSelectionRange(blockStart, blockEnd);
    const selStart = multiLine ? blockStart : Math.max(blockStart, start + firstDelta);
    const selEnd = multiLine ? blockEnd + total : Math.max(blockStart, end + firstDelta);
    this.insert(next.join('\n'), selStart, selEnd);
  }
}
