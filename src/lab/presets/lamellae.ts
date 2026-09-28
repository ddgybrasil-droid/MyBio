import type { Preset } from './types';

const code = `// Ламели S7 — S7 Open Bench
// Семь стеклянных пластин над линованным листом. Каждая работает как
// плоскопараллельная пластинка: при повороте на угол θ изображение
// сдвигается на d = T·sinθ·(1 − cosθ / √(n² − sin²θ)).
// Для R, G и B показатель n разный — отсюда цветная кайма на штрихах.
// Курсор наклоняет пластины: по горизонтали — поворот, по вертикали — наклон.

const vec3 PAPER = vec3(0.925, 0.922, 0.898);
const vec3 INK   = vec3(0.082, 0.094, 0.086);
const vec3 TEAL  = vec3(0.0, 0.427, 0.404);
const float COUNT = 7.0;
const float HALF_H = 0.36;

float PX;

float fill(float d) { return 1.0 - smoothstep(-PX, PX, d); }
float stroke(float d, float w) { return 1.0 - smoothstep(w - PX, w + PX, abs(d)); }

float rect(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

vec3 backdrop(vec2 p) {
  vec3 col = PAPER;
  float fine = (abs(fract(p.y * 20.0 + 0.5) - 0.5)) / 20.0;
  col = mix(col, INK, 0.16 * stroke(fine, 0.0006));
  float major = (abs(fract(p.y * 4.0 + 0.5) - 0.5)) / 4.0;
  col = mix(col, INK, 0.30 * stroke(major, 0.0011));

  float ticks = (abs(fract(p.x * 40.0 + 0.5) - 0.5)) / 40.0;
  float tall = step(abs(fract(p.x * 8.0 + 0.5) - 0.5), 0.05);
  col = mix(col, INK, 0.55 * stroke(ticks, 0.0008) * step(abs(p.y + 0.43), 0.012 + 0.012 * tall));

  vec2 c = p - vec2(-0.06, 0.03);
  float r = length(c);
  col = mix(col, INK, 0.85 * stroke(r - 0.29, 0.0015));
  col = mix(col, INK, 0.45 * stroke(r - 0.21, 0.0008));
  col = mix(col, INK, 0.6 * stroke(c.x, 0.0008) * step(r, 0.34));
  col = mix(col, INK, 0.6 * stroke(c.y, 0.0008) * step(r, 0.34));

  col = mix(col, INK, fill(length(p - vec2(0.17, -0.07)) - 0.12));

  vec2 dir = normalize(vec2(1.0, -0.62));
  float diag = dot(p - vec2(-0.2, 0.18), vec2(-dir.y, dir.x));
  col = mix(col, TEAL, 0.9 * stroke(diag, 0.005) * step(abs(dot(p, dir)), 0.55));
  return col;
}

float slabAngle(float k, vec2 m) {
  return clamp(m.x, -1.0, 1.0) * 0.85 * (1.0 - 0.05 * abs(k)) + 0.16 * sin(iTime * 0.9 - k * 0.55);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  PX = 1.0 / iResolution.y;
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec2 m = iMouse.xy / iResolution.xy * 2.0 - 1.0;
  if (iMouse.x + iMouse.y < 1.0) m = vec2(0.45 * sin(iTime * 0.35), 0.2 * cos(iTime * 0.27));

  float span = min(1.05, iResolution.x / iResolution.y * 0.84);
  float pitch = span / COUNT;
  float faceW = pitch * 0.84;
  float thick = pitch * 0.34;
  float optical = 0.2;
  float phi = clamp(m.y, -1.0, 1.0) * 0.35;

  vec3 col = backdrop(p);

  // Мягкие тени пластин на бумаге, свет сверху слева.
  float shade = 0.0;
  for (int i = 0; i < 7; i++) {
    float k = float(i) - 3.0;
    float th = slabAngle(k, m);
    float foot = faceW * cos(th) + thick * abs(sin(th));
    vec2 q = p - vec2(k * pitch + 0.018, -0.022);
    float d = rect(q, vec2(foot * 0.5, HALF_H), 0.004);
    shade = max(shade, 1.0 - smoothstep(-0.006, 0.03, d));
  }
  col *= 1.0 - 0.075 * shade;

  float idx = clamp(floor(p.x / pitch + COUNT * 0.5), 0.0, COUNT - 1.0);
  float k = idx - (COUNT - 1.0) * 0.5;
  float cx = k * pitch;
  float theta = slabAngle(k, m);
  float ct = cos(theta);
  float st = sin(theta);
  float faceP = faceW * ct;
  float edgeP = thick * abs(st);
  float foot = faceP + edgeP;
  vec2 local = vec2(p.x - cx, p.y);
  float cover = fill(rect(local, vec2(foot * 0.5, HALF_H), 0.004));

  if (cover > 0.0) {
    float faceStart = st >= 0.0 ? -foot * 0.5 : -foot * 0.5 + edgeP;
    float faceCenter = faceStart + faceP * 0.5;
    float u = (local.x - faceCenter) / max(faceP * 0.5, 1e-4);
    vec3 slab;

    if (abs(u) <= 1.0) {
      vec3 n = vec3(1.50, 1.525, 1.565);
      vec3 dx = optical * st * (1.0 - ct / sqrt(n * n - st * st));
      float sp = sin(phi);
      float cp = cos(phi);
      vec3 dy = optical * sp * (1.0 - cp / sqrt(n * n - sp * sp));
      vec2 base = p - vec2(u * faceP * 0.5 * 0.07, 0.0);
      slab.r = backdrop(base - vec2(dx.r, dy.r)).r;
      slab.g = backdrop(base - vec2(dx.g, dy.g)).g;
      slab.b = backdrop(base - vec2(dx.b, dy.b)).b;
      slab *= vec3(0.972, 0.99, 0.984);

      float cosI = ct * cp;
      float fresnel = 0.04 + 0.96 * pow(1.0 - cosI, 5.0);
      float hl = u - clamp((theta - 0.2) * 2.4, -1.5, 1.5);
      float streak = exp(-hl * hl * 30.0) * (0.22 + 0.12 * (p.y / HALF_H * 0.5 + 0.5));
      slab = mix(slab, vec3(1.0), clamp(fresnel + streak, 0.0, 0.65));

      float edgePx = (1.0 - abs(u)) * faceP * 0.5 / PX;
      slab *= 1.0 - 0.22 * (1.0 - smoothstep(0.5, 2.5, edgePx));
    } else {
      // Торец пластины: толща стекла отдаёт зеленью.
      float side = sign(st);
      slab = backdrop(p + vec2(side * 0.035, 0.0)) * vec3(0.6, 0.76, 0.72) + vec3(0.04, 0.06, 0.055);
    }

    float capTop = stroke(local.y - HALF_H + 0.0025, 0.0012);
    float capBottom = stroke(local.y + HALF_H - 0.0025, 0.0012);
    slab = mix(slab, vec3(1.0), 0.55 * capTop);
    slab = mix(slab, INK, 0.35 * capBottom);

    col = mix(col, slab, cover);
  }

  fragColor = vec4(col, 1.0);
}
`;

export const lamellae: Preset = {
  id: 'lamellae',
  title: 'Ламели S7',
  note: 'Семь плоскопараллельных пластин: сдвиг изображения по формуле, дисперсия по каналам. Курсор наклоняет ламели.',
  code,
};
