import { Scene } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { SpecimenKind } from '../content';
import { createSpecimenModel } from './specimen-models';

/** Builds the specimen from scratch (no renderer needed) and returns a binary glTF. */
export async function exportSpecimenGLB(kind: SpecimenKind): Promise<ArrayBuffer> {
  const model = createSpecimenModel(kind, { quality: 'high', dispersion: true, forExport: true });
  const scene = new Scene();
  scene.name = model.root.name;
  scene.add(model.root);
  try {
    const result = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true });
    if (!(result instanceof ArrayBuffer)) throw new Error('GLTFExporter returned JSON instead of GLB');
    return result;
  } finally {
    model.dispose();
  }
}
