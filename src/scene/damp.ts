/** Frame-rate independent exponential smoothing (same curve as maath's `damp`). */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function dampArray(current: Float32Array, target: Float32Array, lambda: number, dt: number): number {
  const k = 1 - Math.exp(-lambda * dt);
  let maxDelta = 0;
  for (let i = 0; i < current.length; i++) {
    const delta = target[i] - current[i];
    current[i] += delta * k;
    const abs = Math.abs(delta);
    if (abs > maxDelta) maxDelta = abs;
  }
  return maxDelta;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

export const DEG = Math.PI / 180;
