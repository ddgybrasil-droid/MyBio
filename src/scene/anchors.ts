import type { SectionId } from '../state';

export const ANCHOR_IDS = ['hero', 'about', 'lab', 'contact'] as const;
export type AnchorId = (typeof ANCHOR_IDS)[number];

const SECTION_IDS: readonly SectionId[] = ['hero', 'about', 'work', 'lab', 'contact'];

export interface AnchorRect {
  present: boolean;
  /** Centre and size in CSS px, viewport coordinates. */
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/**
 * Reads `[data-lens-anchor]` rects once per frame. Elements are re-queried lazily
 * (every ~second) so anchors rendered later by the UI are picked up.
 */
export class AnchorTracker {
  readonly rects = {} as Record<AnchorId, AnchorRect>;
  private readonly elements = {} as Record<AnchorId, Element | null>;
  private sinceQuery = Infinity;

  constructor(private readonly root: ParentNode = document) {
    for (const id of ANCHOR_IDS) {
      this.rects[id] = { present: false, cx: 0, cy: 0, w: 0, h: 0 };
      this.elements[id] = null;
    }
  }

  read(): void {
    if (++this.sinceQuery > 60) {
      this.sinceQuery = 0;
      for (const id of ANCHOR_IDS) {
        const el = this.elements[id];
        if (!el || !el.isConnected) this.elements[id] = this.root.querySelector(`[data-lens-anchor="${id}"]`);
      }
    }
    for (const id of ANCHOR_IDS) {
      const el = this.elements[id];
      const rect = this.rects[id];
      if (!el) {
        rect.present = false;
        continue;
      }
      const r = el.getBoundingClientRect();
      rect.present = r.width > 0 && r.height > 0;
      rect.cx = r.left + r.width / 2;
      rect.cy = r.top + r.height / 2;
      rect.w = r.width;
      rect.h = r.height;
    }
  }
}

/**
 * Converts `state.section` progress into blend weights. Progress 0.5 means the
 * section centre sits at the viewport centre, so with the section height we know
 * where each section is and how much of a central band it covers.
 */
export class SectionWeights {
  readonly weights: Record<SectionId, number> = { hero: 0, about: 0, work: 0, lab: 0, contact: 0 };
  private readonly heights: Record<SectionId, number> = { hero: 0, about: 0, work: 0, lab: 0, contact: 0 };
  private readonly observer: ResizeObserver | null = null;
  private observed = new Set<Element>();

  constructor() {
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id as SectionId;
          if (id in this.heights) this.heights[id] = (entry.target as HTMLElement).offsetHeight;
        }
      });
    }
    this.refresh();
  }

  /** Re-read section elements and heights (on resize or when sections appear). */
  refresh(): void {
    for (const id of SECTION_IDS) {
      const el = document.getElementById(id);
      if (!el) {
        this.heights[id] = 0;
        continue;
      }
      this.heights[id] = el.offsetHeight;
      if (this.observer && !this.observed.has(el)) {
        this.observer.observe(el);
        this.observed.add(el);
      }
    }
  }

  height(id: SectionId): number {
    return this.heights[id];
  }

  /**
   * Returns false when no section covers the centre band (weights keep their last value).
   * `work` has no anchor: its weight is folded into its neighbour, and it is fully
   * occluded by the opaque chamber anyway.
   */
  update(section: Record<SectionId, number>, viewportH: number): boolean {
    const band = viewportH * 0.3;
    const raw: Record<SectionId, number> = { hero: 0, about: 0, work: 0, lab: 0, contact: 0 };
    let sum = 0;
    for (const id of SECTION_IDS) {
      const hs = this.heights[id];
      if (hs <= 0) continue;
      const centre = (0.5 - section[id]) * (hs + viewportH);
      const top = Math.max(centre - hs / 2, -band);
      const bottom = Math.min(centre + hs / 2, band);
      const cover = Math.max(0, bottom - top) / (2 * band);
      raw[id] = cover;
      sum += cover;
    }
    if (sum < 1e-4) return false;
    const workTo: SectionId = section.work < 0.5 ? 'about' : 'lab';
    raw[workTo] += raw.work;
    for (const id of SECTION_IDS) this.weights[id] = id === 'work' ? 0 : raw[id] / sum;
    this.weights.work = raw.work / sum;
    return true;
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observed.clear();
  }
}
