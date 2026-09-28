import {
  BoxGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PMREMGenerator,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Dark vertical flags (as in product photography) give clear glass its crisp edge lines. */
const FLAGS: [x: number, y: number, z: number, sx: number, sy: number, sz: number][] = [
  [-8.5, 11, 13.9, 3.2, 22, 0.1],
  [7.5, 11, 13.9, 2.2, 22, 0.1],
  [-15.6, 11, -1, 0.1, 22, 4.5],
  [14.6, 11, 5.5, 0.1, 22, 3],
  [2, 11, -13.8, 5, 22, 0.1],
];

/** Studio reflections from PMREM(RoomEnvironment) — no HDR download. Caller owns the texture. */
export function createRoomEnvironment(renderer: WebGLRenderer, flags = true): Texture {
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  if (flags) {
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial({ color: 0x111412 });
    for (const [x, y, z, sx, sy, sz] of FLAGS) {
      const flag = new Mesh(geometry, material);
      flag.position.set(x, y, z);
      flag.scale.set(sx, sy, sz);
      room.add(flag);
    }
  }
  const texture = pmrem.fromScene(room, 0.035).texture;
  room.traverse((node) => {
    const mesh = node as { geometry?: { dispose(): void }; material?: { dispose(): void } };
    mesh.geometry?.dispose();
    mesh.material?.dispose();
  });
  pmrem.dispose();
  return texture;
}

export interface GlassOptions {
  thickness?: number;
  ior?: number;
  dispersion?: number;
  roughness?: number;
  clearcoat?: number;
  attenuation?: string;
  attenuationDistance?: number;
  envMapIntensity?: number;
}

const HIGHLIGHT_TONEMAP = /* glsl */ `
  uniform float s7Exposure;
  vec3 s7Fit( vec3 v ) {
    vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
    vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
    return a / b;
  }
  vec3 s7Highlight( vec3 color ) {
    const mat3 inMat = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
    const mat3 outMat = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
    return clamp( outMat * s7Fit( inMat * ( color * s7Exposure / 0.6 ) ), 0.0, 1.0 );
  }
`;

/**
 * On a light, display-referred page any global tone curve flattens what the glass
 * refracts (its shoulder sits right where #ECEBE5 lives). Instead, ACES is applied
 * only to the specular/clearcoat terms; transmitted light stays linear, so the page
 * seen through the glass keeps its exact colour and contrast.
 */
export function useHighlightToneMapping(material: MeshPhysicalMaterial, exposure = 1): void {
  material.toneMapped = false;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.s7Exposure = { value: exposure };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${HIGHLIGHT_TONEMAP}\nvoid main() {`)
      .replace(
        'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
        'vec3 outgoingLight = totalDiffuse + s7Highlight( totalSpecular ) + totalEmissiveRadiance;',
      )
      .replace(
        '( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;',
        's7Highlight( ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat );',
      );
  };
  material.customProgramCacheKey = () => `s7-highlight-${exposure}`;
}

export function createGlassMaterial(options: GlassOptions = {}): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    name: 'S7 Glass',
    color: 0xffffff,
    metalness: 0,
    roughness: options.roughness ?? 0.01,
    transmission: 1,
    thickness: options.thickness ?? 0.5,
    ior: options.ior ?? 1.48,
    dispersion: options.dispersion ?? 0,
    clearcoat: options.clearcoat ?? 0.35,
    clearcoatRoughness: 0.02,
    specularIntensity: 1,
    attenuationColor: new Color(options.attenuation ?? '#eef3ef'),
    attenuationDistance: options.attenuationDistance ?? 2.6,
    envMapIntensity: options.envMapIntensity ?? 1,
  });
}
