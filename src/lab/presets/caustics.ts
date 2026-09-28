import type { Preset } from './types';

const code = `// Каустика — S7 Open Bench
// Свет проходит через неспокойную воду и собирается на дне в сетку линий.
// Для каждого пикселя собираем «фотоны» из соседних ячеек поверхности:
// каждый луч смещается на D·∇h, и там, где смещённые лучи сгущаются,
// бумага под водой светлеет. Для R, G и B глубина чуть разная — тонкая
// цветная кайма на гребнях. Курсор касается воды — расходятся круги.

const vec3 PAPER = vec3(0.925, 0.922, 0.898);
const vec3 INK   = vec3(0.082, 0.094, 0.086);
const float CELL = 0.075;

vec2 gTouch;
float gTouching;

// Градиент высоты воды: семь волн под золотым углом плюс круги от курсора.
vec2 slope(vec2 p, float t) {
  vec2 g = vec2(0.0);
  float amp = 0.5;
  float freq = 0.85;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float a = fi * 2.399963 + 0.35;
    vec2 dir = vec2(cos(a), sin(a));
    float speed = sqrt(freq) * 1.25;
    g += dir * (amp * freq * cos(dot(dir, p) * freq + t * speed + fi * 1.7));
    freq *= 1.33;
    amp *= 0.6;
  }
  vec2 d = p - gTouch;
  float r = length(d) + 1e-4;
  float ring = 0.06 * 4.2 * cos(r * 4.2 - t * 5.0) * exp(-r * 0.55) * smoothstep(0.0, 0.8, r);
  return g + (d / r) * ring * gTouching;
}

float rule(float coord, float period, float width) {
  float d = abs(fract(coord / period + 0.5) - 0.5) * period;
  float aa = fwidth(coord) * 0.75;
  return 1.0 - smoothstep(width - aa, width + aa, d);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float t = iTime * 0.55;
  float zoom = 8.0;
  vec2 x = uv * zoom;
  gTouch = (iMouse.xy - 0.5 * iResolution.xy) / iResolution.y * zoom;
  gTouching = step(1.0, iMouse.x + iMouse.y);

  vec3 depth = vec3(0.56, 0.58, 0.605);

  // Два шага неподвижной точки: откуда примерно пришёл луч в этот пиксель.
  vec2 src = x - depth.g * slope(x, t);
  src = x - depth.g * slope(src, t);

  vec3 light = vec3(0.0);
  vec2 base = floor(src / CELL);
  float inv = 1.0 / (CELL * CELL * 0.85);
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 p = (base + vec2(float(i), float(j)) + 0.5) * CELL;
      vec2 g = slope(p, t);
      vec2 dr = p + depth.r * g - x;
      vec2 dg = p + depth.g * g - x;
      vec2 db = p + depth.b * g - x;
      light += exp(-vec3(dot(dr, dr), dot(dg, dg), dot(db, db)) * inv);
    }
  }
  light /= 3.14159 * 0.85;

  // Линованная бумага на дне, смещённая преломлением.
  vec2 q = src / zoom;
  float lines = rule(q.y, 0.05, 0.0009) * 0.16 + rule(q.y, 0.25, 0.0011) * 0.12 + rule(q.x, 0.25, 0.0009) * 0.07;
  vec3 floorColor = mix(PAPER, INK, lines);

  vec3 shade = mix(vec3(0.85, 0.88, 0.875), vec3(1.0), clamp(light, 0.0, 1.0));
  vec3 spark = 0.2 * (1.0 - exp(-max(light - 1.0, 0.0) * 0.7));
  vec3 col = floorColor * shade + spark;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export const caustics: Preset = {
  id: 'caustics',
  title: 'Каустика',
  note: 'Сетка света на дне: лучи смещаются по наклону воды и сгущаются в линии, с лёгкой дисперсией. Курсор касается воды.',
  code,
};
