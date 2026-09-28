import { s } from './dom';

const W = 800;
const H = 500;

function frame(label: string): SVGSVGElement {
  return s('svg', {
    class: 'lab-poster__art',
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: 'xMidYMid slice',
    role: 'img',
    'aria-label': label,
    focusable: 'false',
  });
}

const f = (n: number) => n.toFixed(1);

function blobPoint(angle: number, cx: number, cy: number, r: number): [number, number] {
  const k = 1 + 0.09 * Math.sin(angle * 3 + 0.6) + 0.05 * Math.sin(angle * 5 - 1.2);
  return [cx + Math.cos(angle) * r * k * 1.08, cy + Math.sin(angle) * r * k];
}

function blobPath(cx: number, cy: number, r: number): string {
  const steps = 96;
  let d = '';
  for (let i = 0; i <= steps; i += 1) {
    const [x, y] = blobPoint((i / steps) * Math.PI * 2, cx, cy, r);
    d += `${i === 0 ? 'M' : 'L'}${f(x)} ${f(y)}`;
  }
  return `${d}Z`;
}

/** Ruled backdrop seen through a glass blob: rules bend inside the outline. */
export function liquidGlassPoster(): SVGSVGElement {
  const svg = frame('Схема: стеклянная капля преломляет линованный фон');
  const cx = 430;
  const cy = 250;
  const r = 150;
  const clipId = `lab-clip-${Math.random().toString(36).slice(2, 8)}`;
  svg.append(s('defs', null, s('clipPath', { id: clipId }, s('path', { d: blobPath(cx, cy, r) }))));

  const outside = s('g', { class: 'lab-poster__rule' });
  for (let y = 30; y < H; y += 22) {
    outside.append(s('line', { x1: 0, y1: y, x2: W, y2: y, 'stroke-width': y % 110 === 30 ? 1.2 : 0.7 }));
  }
  const inside = s('g', { class: 'lab-poster__ink', 'clip-path': `url(#${clipId})` });
  inside.append(s('path', { d: blobPath(cx, cy, r), class: 'lab-poster__fill' }));
  for (let y = 30; y < H; y += 22) {
    let d = '';
    for (let x = cx - r * 1.3; x <= cx + r * 1.3; x += 6) {
      const dx = (x - cx) / (r * 1.1);
      const dy = (y - cy) / r;
      const bulge = Math.max(0, 1 - dx * dx - dy * dy);
      const yy = cy + (y - cy) * (1 - 0.42 * bulge) + Math.sin(dx * 3) * 4 * bulge;
      d += `${d ? 'L' : 'M'}${f(x)} ${f(yy)}`;
    }
    inside.append(s('path', { d, fill: 'none', 'stroke-width': 0.9 }));
  }
  const outline = s('path', { d: blobPath(cx, cy, r), class: 'lab-poster__edge' });
  const highlight = s('path', {
    d: `M${f(cx - r * 0.78)} ${f(cy - r * 0.35)} Q ${f(cx - r * 0.55)} ${f(cy - r * 0.86)} ${f(cx - r * 0.05)} ${f(cy - r * 0.93)}`,
    class: 'lab-poster__spec',
  });
  const target = s('g', { class: 'lab-poster__ink' },
    s('circle', { cx: 660, cy: 118, r: 10, fill: 'none', 'stroke-width': 1 }),
    s('line', { x1: 644, y1: 118, x2: 676, y2: 118, 'stroke-width': 1 }),
    s('line', { x1: 660, y1: 102, x2: 660, y2: 134, 'stroke-width': 1 }),
    s('path', { d: `M650 128 Q 600 170 ${f(cx + r * 0.9)} ${f(cy - r * 0.45)}`, fill: 'none', 'stroke-width': 0.8, 'stroke-dasharray': '3 5' }),
  );
  svg.append(outside, inside, outline, highlight, target);
  return svg;
}

/** Iron-filing pattern of short strokes around a dipole. */
export function lamellaeFieldPoster(): SVGSVGElement {
  const svg = frame('Схема: поле коротких ламелей выстроено по силовым линиям магнита');
  const g = s('g', { class: 'lab-poster__ink' });
  const mx = 470;
  const my = 240;
  const ma = -0.35;
  const mxv = Math.cos(ma);
  const myv = Math.sin(ma);
  const step = 24;
  for (let y = step; y < H; y += step) {
    for (let x = step; x < W; x += step) {
      const ox = ((y / step) % 2) * (step / 2);
      const px = x + ox;
      const rx = px - mx;
      const ry = y - my;
      const r2 = rx * rx + ry * ry + 400;
      const r = Math.sqrt(r2);
      const ux = rx / r;
      const uy = ry / r;
      const dot = mxv * ux + myv * uy;
      const scale = 1 / (r2 * r);
      let bx = (3 * dot * ux - mxv) * scale;
      let by = (3 * dot * uy - myv) * scale;
      bx += 2.2e-7;
      const len = Math.hypot(bx, by) || 1;
      bx /= len;
      by /= len;
      const strength = Math.min(1, 6e4 / r2);
      const half = 5 + 4 * strength;
      g.append(s('line', {
        x1: f(px - bx * half),
        y1: f(y - by * half),
        x2: f(px + bx * half),
        y2: f(y + by * half),
        'stroke-width': (0.8 + 1.1 * strength).toFixed(2),
        opacity: (0.35 + 0.65 * strength).toFixed(2),
      }));
    }
  }
  const puck = s('g', { class: 'lab-poster__ink' },
    s('circle', { cx: mx, cy: my, r: 26, class: 'lab-poster__fill', 'stroke-width': 1.4 }),
    s('line', { x1: f(mx - mxv * 18), y1: f(my - myv * 18), x2: f(mx + mxv * 18), y2: f(my + myv * 18), 'stroke-width': 1.6 }),
  );
  svg.append(g, puck);
  return svg;
}

/** Hanging cloth mesh pinned to a rod, pulled at one point. */
export function clothPoster(): SVGSVGElement {
  const svg = frame('Схема: сетка ткани висит на штанге, одну точку тянут в сторону');
  const cols = 22;
  const rows = 15;
  const left = 190;
  const right = 610;
  const top = 70;
  const bottom = 440;
  const grab = { u: 0.72, v: 0.78, dx: 70, dy: 28 };
  const pts: Array<Array<[number, number]>> = [];
  for (let j = 0; j <= rows; j += 1) {
    const row: Array<[number, number]> = [];
    const v = j / rows;
    for (let i = 0; i <= cols; i += 1) {
      const u = i / cols;
      const du = u - grab.u;
      const dv = v - grab.v;
      const pull = Math.exp(-(du * du + dv * dv) * 9) * v;
      const sway = Math.sin(u * Math.PI * 3 + v * 2) * 8 * v * v;
      const x = left + (right - left) * u + grab.dx * pull + sway;
      const y = top + (bottom - top) * v + grab.dy * pull - 18 * v * v * Math.sin(u * Math.PI);
      row.push([x, y]);
    }
    pts.push(row);
  }
  const mesh = s('g', { class: 'lab-poster__ink', fill: 'none' });
  for (let j = 0; j <= rows; j += 1) {
    const row = pts[j] ?? [];
    mesh.append(s('path', { d: row.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join(''), 'stroke-width': j === 0 ? 1.4 : 0.8 }));
  }
  for (let i = 0; i <= cols; i += 1) {
    const d = pts.map((row, j) => {
      const p = row[i] ?? [0, 0];
      return `${j ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`;
    }).join('');
    mesh.append(s('path', { d, 'stroke-width': 0.8, opacity: 0.7 }));
  }
  const rod = s('g', { class: 'lab-poster__ink' },
    s('line', { x1: left - 50, y1: top - 8, x2: right + 50, y2: top - 8, 'stroke-width': 2.4 }),
  );
  for (let i = 0; i <= cols; i += 2) {
    const p = pts[0]?.[i];
    if (p) rod.append(s('circle', { cx: f(p[0]), cy: f(p[1] - 4), r: 3, class: 'lab-poster__fill', 'stroke-width': 1 }));
  }
  const gp = pts[Math.round(grab.v * rows)]?.[Math.round(grab.u * cols)] ?? [0, 0];
  const cursor = s('g', { class: 'lab-poster__ink' },
    s('circle', { cx: f(gp[0]), cy: f(gp[1]), r: 9, fill: 'none', 'stroke-width': 1.2 }),
    s('circle', { cx: f(gp[0]), cy: f(gp[1]), r: 2.5, class: 'lab-poster__dot' }),
  );
  svg.append(mesh, rod, cursor);
  return svg;
}
