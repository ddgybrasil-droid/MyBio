import {
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  TorusKnotGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { SpecimenKind } from '../content';
import { createGlassMaterial } from './glass';
import { createLamellaGeometries, type Quality } from './lamellae';
import { STRIDE, createPose, heroPose } from './poses';
import { bakeContourTexture, createContourMaterial, createReliefField, createReliefSkirt, createReliefTop } from './relief';

export interface SpecimenView {
  distance: number;
  theta: number;
  phi: number;
  target: Vector3;
  fov: number;
  minDistance: number;
  maxDistance: number;
  minPhi: number;
  maxPhi: number;
}

export interface ModelOptions {
  quality: Quality;
  dispersion: boolean;
  /** Standard/physical materials only (no custom shaders), for GLTFExporter. */
  forExport?: boolean;
}

export interface SpecimenModel {
  root: Group;
  view: SpecimenView;
  /** Whether the viewer should place strip lights behind the object. */
  studio: boolean;
  environmentIntensity: number;
  /** Needs continuous frames even without interaction. */
  animated: boolean;
  update(seconds: number): void;
  setWireframe(on: boolean): void;
  dispose(): void;
}

class Resources {
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();

  mesh(geometry: BufferGeometry, material: Material, name: string): Mesh {
    this.geometries.add(geometry);
    this.materials.add(material);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    return mesh;
  }

  track(material: Material): void {
    this.materials.add(material);
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) {
      for (const value of Object.values(m)) {
        if (value && typeof value === 'object' && 'isTexture' in value) (value as { dispose(): void }).dispose();
      }
      m.dispose();
    }
  }
}

/** Swaps every mesh to a hairline wireframe and back. */
function wireSwap(root: Group, res: Resources): (on: boolean) => void {
  const wire = new MeshBasicMaterial({ color: 0xf7f6f0, wireframe: true, transparent: true, opacity: 0.32, depthWrite: false });
  res.track(wire);
  const originals = new Map<Mesh, Material | Material[]>();
  return (on) => {
    root.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      if (on) {
        if (!originals.has(mesh)) originals.set(mesh, mesh.material);
        mesh.material = wire;
      } else if (originals.has(mesh)) {
        mesh.material = originals.get(mesh)!;
      }
    });
  };
}

function createLens(options: ModelOptions): SpecimenModel {
  const res = new Resources();
  const root = new Group();
  root.name = 'S7 Split Lens';

  const glass = createGlassMaterial({
    thickness: 1.1,
    ior: 1.5,
    dispersion: options.dispersion ? 0.9 : 0,
    clearcoat: 0.6,
    attenuation: '#e6eee8',
    attenuationDistance: 3.5,
    envMapIntensity: 1,
  });
  const pose = createPose();
  heroPose(pose, 0.7);
  const lens = new Group();
  lens.name = 'Lamellae';
  createLamellaGeometries(options.quality).forEach((geometry, i) => {
    const mesh = res.mesh(geometry, glass, `Lamella ${i + 1}`);
    const o = i * STRIDE;
    mesh.position.set(pose.lam[o], pose.lam[o + 1], pose.lam[o + 2]);
    mesh.rotation.set(pose.lam[o + 3], pose.lam[o + 4], pose.lam[o + 5]);
    lens.add(mesh);
  });
  root.add(lens);

  const alu = new MeshStandardMaterial({ name: 'Anodised aluminium', color: '#c9cdca', metalness: 1, roughness: 0.3 });
  const black = new MeshStandardMaterial({ name: 'Black anodised', color: '#1b1e1c', metalness: 0.5, roughness: 0.42 });
  const seg = options.quality === 'high' ? 4 : 2;

  const fixture = new Group();
  fixture.name = 'Fixture';
  const base = res.mesh(new RoundedBoxGeometry(2.8, 0.08, 0.9, seg, 0.03), alu, 'Base plate');
  base.position.y = -1.34;
  const scale = res.mesh(new RoundedBoxGeometry(2.3, 0.006, 0.018, 1, 0.002), black, 'Base scale');
  scale.position.set(0, -1.297, 0.36);
  fixture.add(base, scale);
  for (const side of [-1, 1]) {
    const post = res.mesh(new RoundedBoxGeometry(0.06, 1.34, 0.06, seg, 0.02), alu, 'Post');
    post.position.set(side * 1.19, -0.66, 0);
    const collar = res.mesh(new CylinderGeometry(0.042, 0.042, 0.05, 32), black, 'Collar');
    collar.rotation.z = Math.PI / 2;
    collar.position.set(side * 1.13, 0, 0);
    fixture.add(post, collar);
  }
  const spindle = res.mesh(new CylinderGeometry(0.012, 0.012, 2.34, 20), alu, 'Optical axis spindle');
  spindle.rotation.z = Math.PI / 2;
  fixture.add(spindle);
  root.add(fixture);

  return {
    root,
    view: { distance: 5.8, theta: 0.52, phi: 1.36, target: new Vector3(0, -0.22, 0), fov: 30, minDistance: 3.4, maxDistance: 9, minPhi: 0.45, maxPhi: 1.75 },
    studio: true,
    environmentIntensity: 0.9,
    animated: false,
    update() {},
    setWireframe: wireSwap(root, res),
    dispose: () => res.dispose(),
  };
}

function createKnot(options: ModelOptions): SpecimenModel {
  const res = new Resources();
  const root = new Group();
  root.name = 'Chromatic Knot';
  const high = options.quality === 'high';
  const glass = createGlassMaterial({
    thickness: 1.5,
    ior: 1.52,
    dispersion: options.dispersion ? 6 : 0,
    roughness: 0,
    clearcoat: 1,
    attenuation: '#f3eee4',
    attenuationDistance: 2.8,
    envMapIntensity: 1.1,
  });
  if (high) glass.side = DoubleSide;
  const [tubular, radial] = options.forExport ? [260, 36] : high ? [420, 56] : [200, 28];
  const knot = res.mesh(new TorusKnotGeometry(0.78, 0.3, tubular, radial, 2, 3), glass, 'Knot');
  knot.rotation.set(0.35, 0.2, 0);
  root.add(knot);
  return {
    root,
    view: { distance: 5.4, theta: 0.25, phi: 1.3, target: new Vector3(0, 0, 0), fov: 30, minDistance: 3.2, maxDistance: 9, minPhi: 0.35, maxPhi: 2.8 },
    studio: true,
    environmentIntensity: 0.65,
    animated: false,
    update() {},
    setWireframe: wireSwap(root, res),
    dispose: () => res.dispose(),
  };
}

function createRelief(options: ModelOptions): SpecimenModel {
  const res = new Resources();
  const root = new Group();
  root.name = 'Contour Relief';
  const field = createReliefField(options.forExport ? 112 : options.quality === 'high' ? 240 : 120);
  const topGeometry = createReliefTop(field);
  const skirtGeometry = createReliefSkirt(field);

  let setWireframe: (on: boolean) => void;
  let update: (seconds: number) => void = () => undefined;
  if (options.forExport) {
    const map = bakeContourTexture(field, 1024);
    map.userData.mimeType = 'image/jpeg';
    const top = new MeshStandardMaterial({ name: 'Contour surface', map, roughness: 0.85 });
    const side = new MeshStandardMaterial({ name: 'Cut stone', color: '#202421', roughness: 0.9 });
    root.add(res.mesh(topGeometry, top, 'Relief surface'), res.mesh(skirtGeometry, side, 'Relief block'));
    setWireframe = () => undefined;
  } else {
    const contour = createContourMaterial();
    root.add(res.mesh(topGeometry, contour, 'Relief surface'), res.mesh(skirtGeometry, contour, 'Relief block'));
    setWireframe = (on) => {
      contour.wireframe = on;
    };
    update = (seconds) => {
      contour.uniforms.uBreath.value = 1 + 0.08 * Math.sin((seconds * Math.PI * 2) / 11);
    };
  }
  return {
    root,
    view: { distance: 6.2, theta: 0.62, phi: 0.98, target: new Vector3(0, 0.02, 0), fov: 30, minDistance: 2.6, maxDistance: 8, minPhi: 0.2, maxPhi: 1.45 },
    studio: false,
    environmentIntensity: 0,
    animated: true,
    update,
    setWireframe,
    dispose: () => res.dispose(),
  };
}

export function createSpecimenModel(kind: SpecimenKind, options: ModelOptions): SpecimenModel {
  switch (kind) {
    case 'lens':
      return createLens(options);
    case 'knot':
      return createKnot(options);
    case 'relief':
      return createRelief(options);
  }
}
