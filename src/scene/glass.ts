import {
  BackSide,
  BoxGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  type MeshStandardMaterial,
  PMREMGenerator,
  Vector2,
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

/** Thin strip lights [x, y, z, sx, sy, sz, intensity] that replace the broad frontal softbox. */
const STRIPS: [number, number, number, number, number, number, number][] = [
  [0, 17.5, 13.6, 13, 0.34, 0.1, 60],
  [-3.4, 9, 14.2, 0.12, 9, 0.1, 22],
  [4.2, 10, 14.2, 0.08, 8, 0.1, 16],
];

/**
 * Studio reflections from PMREM(RoomEnvironment), no HDR download. Caller owns the texture.
 *
 * `bench` tunes the room for clear glass on a light page: the frontal softbox (which
 * paints every camera-facing face white) becomes thin strips, the walls are dimmed and
 * dark flags are added, so faces stay clear while bevels pick up crisp lines.
 */
export function createRoomEnvironment(renderer: WebGLRenderer, bench = true): Texture {
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  if (bench) {
    const geometry = new BoxGeometry();
    room.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      if (mesh.position.z > 14) mesh.visible = false;
      const material = mesh.material as MeshStandardMaterial;
      if (material.side === BackSide) material.color.setScalar(0.42);
    });
    const material = new MeshBasicMaterial({ color: 0x111412 });
    for (const [x, y, z, sx, sy, sz] of FLAGS) {
      const flag = new Mesh(geometry, material);
      flag.position.set(x, y, z);
      flag.scale.set(sx, sy, sz);
      room.add(flag);
    }
    for (const [x, y, z, sx, sy, sz, intensity] of STRIPS) {
      const strip = new Mesh(geometry, new MeshBasicMaterial({ color: new Color(intensity, intensity, intensity) }));
      strip.position.set(x, y, z);
      strip.scale.set(sx, sy, sz);
      room.add(strip);
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
export interface EdgeOptions {
  /** Linear multiplier the transmitted light tends to at grazing angles. */
  tint: Color;
  strength: number;
  power: number;
}

/**
 * Applies ACES only to the specular/clearcoat terms (see above). With `edge`, the
 * transmitted light is also darkened toward an ink tint at grazing angles, which is
 * what a real slab's walls and rounded edges look like against a light ground.
 */
export function useHighlightToneMapping(material: MeshPhysicalMaterial, exposure = 1, edge?: EdgeOptions): void {
  material.toneMapped = false;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.s7Exposure = { value: exposure };
    shader.uniforms.s7EdgeTint = { value: edge?.tint ?? new Color(1, 1, 1) };
    shader.uniforms.s7Edge = { value: new Vector2(edge?.strength ?? 0, edge?.power ?? 1) };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${HIGHLIGHT_TONEMAP}\nuniform vec3 s7EdgeTint;\nuniform vec2 s7Edge;\nvoid main() {`)
      .replace(
        'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
        `float s7Rim = s7Edge.x * pow( 1.0 - saturate( abs( dot( geometryNormal, geometryViewDir ) ) ), s7Edge.y );
        totalDiffuse *= mix( vec3( 1.0 ), s7EdgeTint, saturate( s7Rim ) );
        vec3 outgoingLight = totalDiffuse + s7Highlight( totalSpecular ) + totalEmissiveRadiance;`,
      )
      .replace(
        '( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;',
        's7Highlight( ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat );',
      );
  };
  material.customProgramCacheKey = () => `s7-highlight-${exposure}-${edge ? 'edge' : 'plain'}`;
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
