import * as THREE from "three";
import type { BlockymodelShadingMode } from "./blockymodelTypes";

function buildMaterial(
  shadingMode: BlockymodelShadingMode,
  doubleSided: boolean,
  texture?: THREE.Texture,
): THREE.Material {
  const side = doubleSided ? THREE.DoubleSide : THREE.FrontSide;
  const base: THREE.MaterialParameters = {
    side,
    transparent: false,
    alphaTest: 0.5,
  };

  switch (shadingMode) {
    case "fullbright":
      return new THREE.MeshBasicMaterial({ ...base, map: texture });
    case "standard":
      return new THREE.MeshStandardMaterial({
        ...base,
        map: texture,
        metalness: 0.05,
        roughness: 0.85,
      });
    case "reflective":
      return new THREE.MeshStandardMaterial({
        ...base,
        map: texture,
        metalness: 0.55,
        roughness: 0.25,
      });
    case "flat":
    default:
      return new THREE.MeshLambertMaterial({
        ...base,
        map: texture,
        flatShading: true,
      });
  }
}

export function createMaterialFactory(texture?: THREE.Texture) {
  const cache = new Map<string, THREE.Material>();

  return (shadingMode: BlockymodelShadingMode, doubleSided: boolean): THREE.Material => {
    const key = `${shadingMode}:${doubleSided ? "double" : "front"}`;
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const material = buildMaterial(shadingMode, doubleSided, texture);
    cache.set(key, material);
    return material;
  };
}
