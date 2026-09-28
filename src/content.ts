import type { SocialId } from './state';

export interface Social {
  id: SocialId;
  label: string;
  handle: string;
  href: string | null;
  action: 'copy' | 'link' | 'reveal';
}

export const socials: Social[] = [
  { id: 'discord', label: 'Discord', handle: 'ascend_s7', href: null, action: 'copy' },
  { id: 'telegram', label: 'Telegram', handle: 'abouthard', href: 'https://t.me/abouthard', action: 'link' },
  { id: 'tiktok', label: 'TikTok', handle: 'tg.abouthard', href: 'https://www.tiktok.com/@tg.abouthard', action: 'reveal' },
];

export type SpecimenKind = 'lens' | 'knot' | 'relief';

export interface Work {
  kind: SpecimenKind;
  index: string;
  title: string;
  year: string;
  stack: string;
  summary: string;
  file: string;
}

export const works: Work[] = [
  {
    kind: 'lens',
    index: 'S01',
    title: 'S7 Split Lens',
    year: '2026',
    stack: 'Three.js · MeshPhysicalMaterial · GLSL',
    summary: 'Семь стеклянных ламелей, собранных в одну оптику. Каждая пластина преломляет мир с собственным смещением.',
    file: 's7-split-lens.glb',
  },
  {
    kind: 'knot',
    index: 'S02',
    title: 'Chromatic Knot',
    year: '2026',
    stack: 'Three.js · Transmission · Dispersion',
    summary: 'Тор-узел из толстого стекла с дисперсией: свет раскладывается на спектр ровно там, где узел закручивается сильнее всего.',
    file: 'chromatic-knot.glb',
  },
  {
    kind: 'relief',
    index: 'S03',
    title: 'Contour Relief',
    year: '2026',
    stack: 'Three.js · Vertex displacement · Contour shader',
    summary: 'Процедурный рельеф, прочерченный изолиниями. Рельеф медленно дышит, а изолинии остаются точными на любой высоте.',
    file: 'contour-relief.glb',
  },
];
