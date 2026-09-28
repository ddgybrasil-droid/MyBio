import type { Preset } from './types';

const code = `// Ртутная капля — S7 Open Bench
// Жидкий хром: шесть сфер, слитых в одну каплю плавным минимумом,
// трассировка лучей по полю расстояний. Отражения — процедурная студия:
// софтбоксы, чёрный флаг за камерой и бумажная циклорама.
// Одна сфера следует за курсором; второй отскок ловит отражения капли в себе.

const vec3 PAPER = vec3(0.925, 0.922, 0.898);
const vec3 INK   = vec3(0.082, 0.094, 0.086);
const float FLOOR_Y = -0.62;
const vec3 KEY = vec3(-0.46, 0.84, 0.28);

float gT;
vec3 gMouse;

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toDisplay(vec3 c) { return pow(c, vec3(1.0 / 2.2)); }

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

float map(vec3 p) {
  float d = length(p - gMouse) - 0.3;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec3 c = vec3(
      sin(gT * 0.53 + fi * 1.91) * 0.85,
      0.02 + sin(gT * 0.71 + fi * 2.63) * 0.32,
      cos(gT * 0.47 + fi * 1.37) * 0.45);
    float r = 0.24 + 0.07 * sin(fi * 3.7 + 1.0);
    d = smin(d, length(p - c) - r, 0.42);
  }
  return d;
}

vec3 normalAt(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.0015;
  return normalize(
    k.xyy * map(p + k.xyy * e) +
    k.yyx * map(p + k.yyx * e) +
    k.yxy * map(p + k.yxy * e) +
    k.xxx * map(p + k.xxx * e));
}

float march(vec3 ro, vec3 rd, float maxT) {
  float t = 0.0;
  for (int i = 0; i < 96; i++) {
    float d = map(ro + rd * t);
    if (d < 0.0006 + 0.0008 * t) return t;
    t += d * 0.9;
    if (t > maxT) break;
  }
  return -1.0;
}

float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.03;
  for (int i = 0; i < 40; i++) {
    float h = map(ro + rd * t);
    res = min(res, 9.0 * h / t);
    t += clamp(h, 0.02, 0.25);
    if (res < 0.002 || t > 4.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

float softBox(float az, float el, vec2 center, vec2 halfSize, float feather) {
  vec2 d = abs(vec2(az, el) - center) - halfSize;
  return 1.0 - smoothstep(-feather, feather, max(d.x, d.y));
}

// Студия в линейном свете. az = 0 — взгляд вглубь сцены.
vec3 studio(vec3 d) {
  float az = atan(d.x, -d.z);
  float el = asin(clamp(d.y, -1.0, 1.0));
  vec3 paper = toLinear(PAPER);
  vec3 col = paper * mix(0.5, 1.0, smoothstep(-0.3, 0.25, el));
  col = mix(col, vec3(3.0), smoothstep(1.02, 1.12, el));
  col = mix(col, vec3(4.2), softBox(az, el, vec2(-1.7, 0.32), vec2(0.26, 0.42), 0.035));
  col = mix(col, vec3(1.9), softBox(az, el, vec2(1.95, 0.18), vec2(0.2, 0.3), 0.05));
  float behind = abs(abs(az) - 3.14159);
  float flag = (1.0 - smoothstep(0.75, 0.85, behind)) * softBox(0.0, el, vec2(0.0, 0.12), vec2(1.0, 0.42), 0.06);
  col = mix(col, toLinear(INK), flag);
  return col;
}

vec3 floorColor(vec3 fp, float dist) {
  float sh = softShadow(fp, normalize(KEY));
  float contact = clamp(map(fp) / 0.4, 0.0, 1.0);
  float lit = mix(0.6, 1.0, sh) * mix(0.5, 1.0, sqrt(contact));
  lit = mix(lit, 1.0, smoothstep(4.0, 9.0, dist));
  return toLinear(PAPER) * lit;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  gT = iTime;
  float aspect = iResolution.x / iResolution.y;
  float focal = 1.9 * clamp(aspect / 1.45, 0.62, 1.0);

  vec3 ro = vec3(0.0, 0.28, 3.3);
  vec3 ta = vec3(0.0, -0.1, 0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);

  gMouse = vec3(sin(gT * 0.6) * 0.6, 0.22 + 0.1 * sin(gT * 1.1), 0.3);
  if (iMouse.x + iMouse.y > 1.0) {
    vec2 mu = (iMouse.xy - 0.5 * iResolution.xy) / iResolution.y;
    vec3 md = normalize(mu.x * uu + mu.y * vv + focal * ww);
    float mt = (0.3 - ro.z) / md.z;
    gMouse = ro + md * mt;
    gMouse.y = max(gMouse.y, FLOOR_Y + 0.3);
  }

  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 rd = normalize(uv.x * uu + uv.y * vv + focal * ww);

  vec3 col;
  float t = march(ro, rd, 9.0);
  if (t > 0.0) {
    vec3 pos = ro + rd * t;
    vec3 n = normalAt(pos);
    vec3 r = reflect(rd, n);
    vec3 refl;
    float t2 = march(pos + n * 0.004, r, 3.0);
    if (t2 > 0.0) {
      vec3 p2 = pos + n * 0.004 + r * t2;
      vec3 n2 = normalAt(p2);
      refl = studio(reflect(r, n2)) * 0.72;
    } else if (r.y < -0.02) {
      float tf = (FLOOR_Y - pos.y) / r.y;
      refl = floorColor(pos + r * tf, tf);
    } else {
      refl = studio(r);
    }
    float cosT = max(dot(n, -rd), 0.0);
    vec3 f0 = vec3(0.77, 0.78, 0.79);
    vec3 fres = f0 + (1.0 - f0) * pow(1.0 - cosT, 5.0);
    col = refl * fres;
  } else if (rd.y < 0.0) {
    float tf = (FLOOR_Y - ro.y) / rd.y;
    col = floorColor(ro + rd * tf, tf);
  } else {
    col = toLinear(PAPER);
  }

  fragColor = vec4(toDisplay(clamp(col, 0.0, 1.0)), 1.0);
}
`;

export const mercury: Preset = {
  id: 'mercury',
  title: 'Ртутная капля',
  note: 'Жидкий хром в студийном свете: поле расстояний, два отскока, мягкие тени на бумаге. Капля идёт за курсором.',
  code,
};
