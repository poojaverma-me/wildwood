import { useLoader } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MODELS, PH, TEXTURES, type ModelId, type TextureId } from "@/lib/assets";

// Poly Haven's glTF files reference their buffers and textures by relative paths that live in
// other CDN folders. Rewrite them on the default manager so drei's progress tracking still works.
const remap = new Map<string, string>();
for (const m of Object.values(MODELS)) {
  const dir = (PH + m.url).replace(/[^/]+$/, "");
  for (const [rel, abs] of Object.entries(m.include)) remap.set(dir + rel, PH + abs);
}
THREE.DefaultLoadingManager.setURLModifier((url) => remap.get(url) ?? url);

const tamed = new WeakSet<object>();

/**
 * Loads a Poly Haven model. Refractive glass (KHR_materials_transmission) is swapped for plain
 * transparent glass: a single transmissive material makes three.js re-render the whole scene
 * into an extra buffer every frame, which tripled the frame time.
 */
export function useModel(id: ModelId) {
  const gltf = useLoader(GLTFLoader, PH + MODELS[id].url);
  if (!tamed.has(gltf)) {
    tamed.add(gltf);
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const pm = m as THREE.MeshPhysicalMaterial;
        if (pm.transmission > 0) {
          pm.transmission = 0;
          pm.transparent = true;
          pm.opacity = 0.35;
          pm.depthWrite = false;
        }
      }
    });
  }
  return gltf;
}

export function preloadModels(ids: ModelId[]) {
  for (const id of ids) useLoader.preload(GLTFLoader, PH + MODELS[id].url);
}

export type PBR = { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap?: THREE.Texture };

/** Loads a Poly Haven texture set, tiled, with sRGB colour and anisotropic filtering. */
export function usePBR(id: TextureId, repeat: [number, number] = [1, 1]): PBR {
  const t = TEXTURES[id];
  const urls = [PH + t.diff, PH + t.nor, ...(t.rough ? [PH + t.rough] : [])];
  const tex = useLoader(THREE.TextureLoader, urls);
  return useMemo(() => {
    const out = tex.map((x) => {
      const c = x.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(repeat[0], repeat[1]);
      c.anisotropy = 8;
      c.needsUpdate = true;
      return c;
    });
    out[0].colorSpace = THREE.SRGBColorSpace;
    return { map: out[0], normalMap: out[1], roughnessMap: out[2] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tex, repeat[0], repeat[1]]);
}

/** Raw (untiled-config) textures for custom shaders. */
export function useRawTextures(ids: TextureId[]) {
  const urls = ids.flatMap((id) => [PH + TEXTURES[id].diff, PH + TEXTURES[id].nor]);
  const tex = useLoader(THREE.TextureLoader, urls);
  return useMemo(() => {
    tex.forEach((x, i) => {
      x.wrapS = x.wrapT = THREE.RepeatWrapping;
      x.anisotropy = 8;
      x.colorSpace = i % 2 === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      x.needsUpdate = true;
    });
    return ids.map((_, i) => ({ map: tex[i * 2], normalMap: tex[i * 2 + 1] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tex]);
}
