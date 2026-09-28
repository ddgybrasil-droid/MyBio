import { Color } from 'three';

const FALLBACK = {
  canvas: '#ecebe5',
  ink: '#151816',
  inkSecondary: '#5b615d',
  void: '#111412',
  voidInk: '#f7f6f0',
} as const;

export type PaletteKey = keyof typeof FALLBACK;

const CSS_VAR: Record<PaletteKey, string> = {
  canvas: '--canvas',
  ink: '--ink',
  inkSecondary: '--ink-secondary',
  void: '--void',
  voidInk: '--void-ink',
};

/** Hex string of a token, read from CSS custom properties so the WebGL clear colour matches the page exactly. */
export function tokenHex(key: PaletteKey): string {
  if (typeof document !== 'undefined') {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(CSS_VAR[key]).trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(raw)) {
      return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
    }
  }
  return FALLBACK[key];
}

/** Token as a three.js Color (converted to the linear working space). */
export function tokenColor(key: PaletteKey): Color {
  return new Color(tokenHex(key));
}
