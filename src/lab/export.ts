import { EPILOGUE, PRELUDE } from './gl-runner';

const escapeText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** A single-file page with the shader and a minimal WebGL2 runner; works when opened from disk. */
export function buildStandaloneHtml(code: string, title: string): string {
  const safeCode = code.replace(/<\/script/gi, '<\\/script');
  const prelude = JSON.stringify(PRELUDE);
  const epilogue = JSON.stringify(EPILOGUE);
  return `<!doctype html>
<!--
  ${escapeText(title)} — S7 Open Bench
  Автор: ASCEND / S7 · Лицензия: MIT

  Шейдер в стиле Shadertoy: функция mainImage(out vec4, in vec2).
  Юниформы: iTime, iTimeDelta, iFrame, iResolution, iMouse.
  iMouse.xy — положение указателя в пикселях, iMouse.zw — точка нажатия
  (положительная, пока кнопка зажата). Пробел — пауза.
  Файл работает без сервера: откройте его двойным щелчком.
-->
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeText(title)} — S7 Open Bench</title>
<style>
  html, body { margin: 0; height: 100%; background: #ecebe5; overflow: hidden; }
  canvas { display: block; width: 100vw; height: 100vh; touch-action: none; }
  p { position: fixed; left: 16px; bottom: 16px; margin: 0; padding: 8px 12px; border-radius: 6px;
      font: 500 12px/1.4 ui-monospace, 'IBM Plex Mono', monospace; letter-spacing: .06em; color: #151816;
      background: rgba(247, 246, 240, .82); border: 1px solid rgba(21, 24, 22, .16); }
  pre { position: fixed; inset: 16px; margin: 0; padding: 16px; overflow: auto; white-space: pre-wrap;
        font: 12px/1.5 ui-monospace, monospace; color: #151816; background: #f7f6f0; border: 1px solid rgba(21, 24, 22, .32); }
</style>
</head>
<body>
<canvas id="view"></canvas>
<p>${escapeText(title.toUpperCase())} · S7 OPEN BENCH · ПРОБЕЛ — ПАУЗА</p>
<script id="shader" type="x-shader/x-fragment">
${safeCode}
</script>
<script>
(function () {
  var PRELUDE = ${prelude};
  var EPILOGUE = ${epilogue};
  var VERTEX = '#version 300 es\\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}';
  var canvas = document.getElementById('view');
  var gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  function fail(message) {
    var pre = document.createElement('pre');
    pre.textContent = message;
    document.body.appendChild(pre);
  }
  if (!gl) { fail('Нужен браузер с поддержкой WebGL2.'); return; }
  function shader(type, source) {
    var s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'compile error');
    return s;
  }
  var program;
  try {
    var user = document.getElementById('shader').textContent.replace(/^\\n/, '');
    program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, PRELUDE + user + EPILOGUE));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'link error');
  } catch (err) {
    fail(String(err && err.message ? err.message : err));
    return;
  }
  gl.useProgram(program);
  gl.bindVertexArray(gl.createVertexArray());
  var u = {};
  ['iResolution', 'iTime', 'iTimeDelta', 'iFrame', 'iMouse'].forEach(function (name) { u[name] = gl.getUniformLocation(program, name); });
  var mouse = [0, 0, 0, 0], down = false, frame = 0, time = 0, last = 0, running = true;
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  }
  function pointer(e) {
    var r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * canvas.width / r.width, (r.bottom - e.clientY) * canvas.height / r.height];
  }
  canvas.addEventListener('pointermove', function (e) { var p = pointer(e); mouse[0] = p[0]; mouse[1] = p[1]; });
  canvas.addEventListener('pointerdown', function (e) { var p = pointer(e); down = true; mouse = [p[0], p[1], p[0], p[1]]; });
  window.addEventListener('pointerup', function () { down = false; mouse[2] = -Math.abs(mouse[2]); mouse[3] = -Math.abs(mouse[3]); });
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space') { e.preventDefault(); running = !running; last = 0; if (running) requestAnimationFrame(tick); }
  });
  function tick(now) {
    if (!running) return;
    var dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
    last = now;
    time += dt;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform3f(u.iResolution, canvas.width, canvas.height, 1);
    gl.uniform1f(u.iTime, time);
    gl.uniform1f(u.iTimeDelta, dt);
    gl.uniform1i(u.iFrame, frame++);
    gl.uniform4f(u.iMouse, mouse[0], mouse[1], down ? mouse[2] : -Math.abs(mouse[2]), down ? mouse[3] : -Math.abs(mouse[3]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(tick);
  }
  resize();
  requestAnimationFrame(tick);
})();
</script>
</body>
</html>
`;
}

export function downloadText(filename: string, text: string, mime = 'text/html'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
