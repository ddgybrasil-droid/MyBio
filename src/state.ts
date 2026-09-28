export type SectionId = 'hero' | 'about' | 'work' | 'lab' | 'contact';
export type SocialId = 'discord' | 'telegram' | 'tiktok';
export type Tier = 0 | 1 | 2;

export interface SceneState {
  /** Whole-page scroll progress, 0..1. */
  scroll: number;
  /** Smoothed signed scroll velocity in px per frame. */
  velocity: number;
  /** Per-section progress: 0 when the section top meets the viewport bottom, 1 when its bottom meets the viewport top. */
  section: Record<SectionId, number>;
  /** Pointer in normalised device coordinates, -1..1, y up. */
  pointer: { x: number; y: number };
  /** Social channel that is hovered, focused, or expanded. */
  activeSocial: SocialId | null;
  /** One-shot impulse for WebGL ripples. `t` is performance.now() at trigger time; x/y are NDC. */
  burst: { social: SocialId | null; x: number; y: number; t: number };
  /** 0 on light sections, 1 inside the dark specimen chamber. */
  dark: number;
  reducedMotion: boolean;
  /** 0 = no WebGL, 1 = lite (mobile / weak GPU), 2 = full. */
  tier: Tier;
}

export const state: SceneState = {
  scroll: 0,
  velocity: 0,
  section: { hero: 0, about: 0, work: 0, lab: 0, contact: 0 },
  pointer: { x: 0, y: 0 },
  activeSocial: null,
  burst: { social: null, x: 0, y: 0, t: -1e9 },
  dark: 0,
  reducedMotion: false,
  tier: 2,
};

export function triggerBurst(social: SocialId | null, clientX: number, clientY: number): void {
  state.burst = {
    social,
    x: (clientX / window.innerWidth) * 2 - 1,
    y: -((clientY / window.innerHeight) * 2 - 1),
    t: performance.now(),
  };
}
