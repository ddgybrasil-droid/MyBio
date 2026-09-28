export const PRELUDE = `#version 300 es
precision highp float;
precision highp int;
uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
out vec4 s7FragColor;
`;

export const EPILOGUE = `
void main() {
  vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
  mainImage(color, gl_FragCoord.xy);
  s7FragColor = vec4(color.rgb, 1.0);
}
`;

/** Number of lines that precede the first line of user code in the compiled source. */
export const PRELUDE_LINES = PRELUDE.split('\n').length - 1;

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export interface CompileError {
  /** 1-based line in the user's code, or null when the error is outside it. */
  line: number | null;
  message: string;
}

export interface CompileResult {
  ok: boolean;
  errors: CompileError[];
}

export interface RunnerOptions {
  maxDpr: number;
  /** Smooth iMouse.xy toward the pointer. */
  smoothPointer: boolean;
  onStats?(fps: number, width: number, height: number): void;
  onContext?(state: 'lost' | 'restored'): void;
  onFirstFrame?(): void;
}

interface Uniforms {
  resolution: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  timeDelta: WebGLUniformLocation | null;
  frame: WebGLUniformLocation | null;
  mouse: WebGLUniformLocation | null;
}

export function parseInfoLog(log: string, userLineCount: number): CompileError[] {
  const errors: CompileError[] = [];
  for (const raw of log.split('\n')) {
    const text = raw.replace(/\0/g, '').trim();
    if (!text) continue;
    const angle = /^(?:ERROR|WARNING):\s*\d+:(\d+):\s*(.*)$/i.exec(text);
    const mesa = /^\d+:(\d+)\(\d+\):\s*(?:error|warning):?\s*(.*)$/i.exec(text);
    const match = angle ?? mesa;
    if (!match) {
      if (!/compilation terminated/i.test(text)) errors.push({ line: null, message: text });
      continue;
    }
    const shaderLine = Number(match[1]);
    const line = shaderLine - PRELUDE_LINES;
    const inUserCode = line >= 1 && line <= userLineCount;
    errors.push({ line: inUserCode ? line : null, message: match[2] || text });
  }
  return errors;
}

export class GlRunner {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vertexShader: WebGLShader | null = null;
  private uniforms: Uniforms | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private source: string | null = null;
  private readonly opts: RunnerOptions;

  private playing = false;
  private active = true;
  private raf = 0;
  private lastNow = 0;
  private time = 0;
  private delta = 0;
  private frame = 0;
  private drewFirst = false;

  private cssWidth = 0;
  private cssHeight = 0;
  private scale = 1;
  private statFrames = 0;
  private statStart = 0;
  private stableSeconds = 0;

  private pointerTarget = { x: 0, y: 0 };
  private pointer = { x: 0, y: 0 };
  private click = { x: 0, y: 0, down: false };
  private hasPointer = false;

  private readonly resizeObserver: ResizeObserver;
  private readonly cleanups: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, opts: RunnerOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.initContext();

    this.resizeObserver = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      this.cssWidth = box.width;
      this.cssHeight = box.height;
      this.applySize();
      if (!this.playing) {
        this.draw();
        this.opts.onStats?.(0, this.canvas.width, this.canvas.height);
      }
    });
    this.resizeObserver.observe(canvas);

    this.listen(canvas, 'webglcontextlost', (event) => {
      event.preventDefault();
      this.cancelLoop();
      this.program = null;
      this.vertexShader = null;
      this.uniforms = null;
      this.vao = null;
      this.opts.onContext?.('lost');
    });
    this.listen(canvas, 'webglcontextrestored', () => {
      this.setupResources();
      if (this.source !== null) this.compile(this.source);
      this.opts.onContext?.('restored');
      this.schedule();
      if (!this.playing) this.draw();
    });

    this.listen(canvas, 'pointermove', (event) => this.onPointer(event as PointerEvent));
    this.listen(canvas, 'pointerdown', (event) => {
      const e = event as PointerEvent;
      this.onPointer(e);
      const p = this.toPixels(e);
      this.click = { x: p.x, y: p.y, down: true };
    });
    const release = () => {
      this.click.down = false;
    };
    this.listen(canvas, 'pointerup', release);
    this.listen(canvas, 'pointercancel', release);
  }

  get supported(): boolean {
    return this.gl !== null;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get contextLost(): boolean {
    return this.gl?.isContextLost() ?? true;
  }

  /** Compiles and links user code. On failure the previous program keeps rendering. */
  compile(userCode: string): CompileResult {
    const gl = this.gl;
    const userLines = userCode.split('\n').length;
    if (!gl) return { ok: false, errors: [{ line: null, message: 'WebGL2 недоступен в этом браузере.' }] };
    if (gl.isContextLost()) {
      this.source = userCode;
      return { ok: false, errors: [{ line: null, message: 'Контекст WebGL потерян. Код скомпилируется после восстановления.' }] };
    }
    if (!this.vertexShader) this.setupResources();

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fs || !this.vertexShader) return { ok: false, errors: [{ line: null, message: 'Не удалось создать шейдер.' }] };
    gl.shaderSource(fs, PRELUDE + userCode + EPILOGUE);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(fs) ?? '';
      gl.deleteShader(fs);
      const errors = parseInfoLog(log, userLines);
      return { ok: false, errors: errors.length ? errors : [{ line: null, message: 'Ошибка компиляции.' }] };
    }

    const program = gl.createProgram();
    gl.attachShader(program, this.vertexShader);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? '';
      gl.deleteProgram(program);
      return { ok: false, errors: [{ line: null, message: log.trim() || 'Ошибка линковки программы.' }] };
    }

    if (this.program) gl.deleteProgram(this.program);
    this.program = program;
    this.source = userCode;
    this.uniforms = {
      resolution: gl.getUniformLocation(program, 'iResolution'),
      time: gl.getUniformLocation(program, 'iTime'),
      timeDelta: gl.getUniformLocation(program, 'iTimeDelta'),
      frame: gl.getUniformLocation(program, 'iFrame'),
      mouse: gl.getUniformLocation(program, 'iMouse'),
    };
    if (!this.playing) this.draw();
    return { ok: true, errors: [] };
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.lastNow = 0;
    this.statStart = 0;
    this.schedule();
  }

  pause(): void {
    this.playing = false;
    this.cancelLoop();
    this.opts.onStats?.(0, this.canvas.width, this.canvas.height);
  }

  /** Visibility gate (offscreen / hidden tab). Does not change the play state. */
  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (active) {
      this.lastNow = 0;
      this.statStart = 0;
      this.schedule();
    } else {
      this.cancelLoop();
    }
  }

  resetTime(time = 0): void {
    this.time = time;
    this.frame = 0;
    if (!this.playing) this.draw();
  }

  /** Renders a single frame at the current time (used while paused). */
  renderOnce(): void {
    this.draw();
  }

  dispose(): void {
    this.cancelLoop();
    this.resizeObserver.disconnect();
    for (const fn of this.cleanups) fn();
    const gl = this.gl;
    if (gl && !gl.isContextLost()) {
      if (this.program) gl.deleteProgram(this.program);
      if (this.vertexShader) gl.deleteShader(this.vertexShader);
      if (this.vao) gl.deleteVertexArray(this.vao);
    }
    this.program = null;
    this.gl = null;
  }

  private initContext(): void {
    const gl = this.canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    this.gl = gl;
    if (gl) this.setupResources();
  }

  private setupResources(): void {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    if (!vs) return;
    gl.shaderSource(vs, VERTEX);
    gl.compileShader(vs);
    this.vertexShader = vs;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
  }

  private listen(target: EventTarget, type: string, fn: (event: Event) => void): void {
    target.addEventListener(type, fn);
    this.cleanups.push(() => target.removeEventListener(type, fn));
  }

  private toPixels(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? this.canvas.width / rect.width : 1;
    const sy = rect.height > 0 ? this.canvas.height / rect.height : 1;
    return { x: (event.clientX - rect.left) * sx, y: (rect.bottom - event.clientY) * sy };
  }

  private onPointer(event: PointerEvent): void {
    const p = this.toPixels(event);
    this.pointerTarget = p;
    if (!this.hasPointer || !this.opts.smoothPointer) this.pointer = { ...p };
    this.hasPointer = true;
  }

  private applySize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.opts.maxDpr) * this.scale;
    const w = Math.max(1, Math.round(this.cssWidth * dpr));
    const h = Math.max(1, Math.round(this.cssHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      const kx = w / (this.canvas.width || w);
      const ky = h / (this.canvas.height || h);
      this.pointer.x *= kx;
      this.pointer.y *= ky;
      this.pointerTarget.x *= kx;
      this.pointerTarget.y *= ky;
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private schedule(): void {
    if (this.raf || !this.playing || !this.active) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  private cancelLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private readonly tick = (now: number): void => {
    this.raf = 0;
    if (!this.playing || !this.active) return;
    const dt = this.lastNow ? Math.min((now - this.lastNow) / 1000, 0.1) : 1 / 60;
    this.lastNow = now;
    this.time += dt;
    this.delta = dt;

    if (this.opts.smoothPointer) {
      const k = 1 - Math.exp(-dt * 10);
      this.pointer.x += (this.pointerTarget.x - this.pointer.x) * k;
      this.pointer.y += (this.pointerTarget.y - this.pointer.y) * k;
    }

    this.draw();
    this.frame += 1;
    this.measure(now);
    this.schedule();
  };

  private measure(now: number): void {
    if (!this.statStart) {
      this.statStart = now;
      this.statFrames = 0;
      return;
    }
    this.statFrames += 1;
    const elapsed = now - this.statStart;
    if (elapsed < 1000) return;
    const fps = (this.statFrames * 1000) / elapsed;
    this.statStart = now;
    this.statFrames = 0;
    this.adapt(fps);
    this.opts.onStats?.(fps, this.canvas.width, this.canvas.height);
  }

  /** Lowers the render scale on slow GPUs and restores it slowly when there is headroom. */
  private adapt(fps: number): void {
    const prev = this.scale;
    if (fps < 40 && this.scale > 0.5) {
      this.scale = Math.max(0.5, this.scale * 0.8);
      this.stableSeconds = 0;
    } else if (fps > 57) {
      this.stableSeconds += 1;
      if (this.stableSeconds >= 4 && this.scale < 1) {
        this.scale = Math.min(1, this.scale * 1.15);
        this.stableSeconds = 0;
      }
    } else {
      this.stableSeconds = 0;
    }
    if (prev !== this.scale) this.applySize();
  }

  private draw(): void {
    const gl = this.gl;
    if (!gl || gl.isContextLost() || !this.program || !this.uniforms) return;
    if (this.cssWidth === 0 || this.cssHeight === 0) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const u = this.uniforms;
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform3f(u.resolution, w, h, 1);
    gl.uniform1f(u.time, this.time);
    gl.uniform1f(u.timeDelta, this.delta);
    gl.uniform1i(u.frame, this.frame);
    const cx = this.click.down ? this.click.x : -Math.abs(this.click.x);
    const cy = this.click.down ? this.click.y : -Math.abs(this.click.y);
    gl.uniform4f(u.mouse, this.hasPointer ? this.pointer.x : 0, this.hasPointer ? this.pointer.y : 0, cx, cy);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!this.drewFirst) {
      this.drewFirst = true;
      this.opts.onFirstFrame?.();
    }
  }
}
