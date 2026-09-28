import type { Preset } from './types';

const code = `// Интерференция — S7 Open Bench
// Кольца Ньютона: между линзой и пластиной остаётся воздушный зазор
// d = r² / 2R. Отражённый свет гаснет там, где 2d кратно длине волны.
// В белом свете первые порядки окрашены, дальние сливаются в ровный тон —
// поэтому спектр интегрируется по шестнадцати длинам волн.
// Вокруг линзы две решётки окружностей складываются в муар.
// Курсор сдвигает точку контакта и центр второй решётки.

const vec3 PAPER = vec3(0.925, 0.922, 0.898);
const vec3 INK   = vec3(0.082, 0.094, 0.086);
const float LENS_R = 0.34;

float PX;

float sq(float x) { return x * x; }
float stroke(float d, float w) { return 1.0 - smoothstep(w - PX, w + PX, abs(d)); }

// Грубая аппроксимация чувствительности глаза в RGB дисплея.
vec3 sensitivity(float lambda) {
  float r = exp(-sq((lambda - 600.0) / 48.0)) + 0.32 * exp(-sq((lambda - 445.0) / 22.0));
  float g = exp(-sq((lambda - 550.0) / 45.0));
  float b = exp(-sq((lambda - 455.0) / 30.0));
  return vec3(r, g, b);
}

// Отражённая интенсивность для воздушного зазора gap (нм) в белом свете.
vec3 newton(float gap) {
  vec3 acc = vec3(0.0);
  vec3 norm = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    float lambda = 400.0 + 300.0 * (float(i) + 0.5) / 16.0;
    vec3 w = sensitivity(lambda);
    float phase = 6.2831853 * 2.0 * gap / lambda;
    acc += w * (0.5 - 0.5 * cos(phase));
    norm += w;
  }
  return acc / norm;
}

float rings(vec2 p, vec2 c, float freq) {
  float d = abs(fract(length(p - c) * freq) - 0.5) / freq;
  return stroke(d, 0.0021);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  PX = 1.0 / iResolution.y;
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec2 m = (iMouse.xy - 0.5 * iResolution.xy) / iResolution.y;
  if (iMouse.x + iMouse.y < 1.0) m = vec2(0.26 * sin(iTime * 0.29), 0.14 * sin(iTime * 0.41 + 1.0));

  // Муар: две прозрачные плёнки с окружностями, наложенные друг на друга.
  float a = rings(p, vec2(0.0), 58.0);
  float b = rings(p, m, 58.0);
  vec3 col = PAPER * (1.0 - 0.36 * a) * (1.0 - 0.36 * b);

  float r = length(p);
  // Тень линзы на листе.
  float shadow = 1.0 - smoothstep(0.0, 0.045, length(p - vec2(0.012, -0.016)) - LENS_R);
  col *= 1.0 - 0.1 * shadow;

  if (r < LENS_R + 2.0 * PX) {
    vec2 toM = m;
    float reach = LENS_R * 0.62;
    vec2 contact = toM * min(1.0, reach / max(length(toM), 1e-4));
    float rr = length(p - contact);
    float breathe = 70.0 * (0.5 + 0.5 * sin(iTime * 0.7));
    float gap = 11000.0 * rr * rr + breathe;
    vec3 film = newton(gap);
    film = mix(vec3(dot(film, vec3(0.3333))), film, 0.4);
    // Некогерентный предел (film ≈ 0.5) совпадает с тоном бумаги.
    vec3 lens = PAPER * mix(vec3(0.24), vec3(1.12), pow(film, vec3(0.6)));
    lens = min(lens, vec3(1.0));

    // Скос края: тёмная кромка и блик сверху слева.
    float edge = LENS_R - r;
    float ang = atan(p.y, p.x);
    float spec = smoothstep(0.35, 1.0, cos(ang - 2.3));
    lens = mix(lens, vec3(1.0), 0.7 * spec * stroke(edge - 0.007, 0.0016));
    lens = mix(lens, INK, 0.55 * stroke(edge - 0.0015, 0.0012));
    float inside = 1.0 - smoothstep(-PX, PX, r - LENS_R);
    col = mix(col, lens, inside);
  }

  fragColor = vec4(col, 1.0);
}
`;

export const interference: Preset = {
  id: 'interference',
  title: 'Интерференция',
  note: 'Кольца Ньютона в белом свете и муар двух решёток. Курсор сдвигает точку контакта линзы.',
  code,
};
