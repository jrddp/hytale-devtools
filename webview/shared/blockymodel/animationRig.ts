import * as THREE from "three";
import type { TextureDimensions } from "./uv";

export interface BlockymodelAnimationBinding {
  nodeName: string;
  isPiece: boolean;
  pivot: THREE.Object3D;
  mesh: THREE.Mesh | null;
  basePosition: THREE.Vector3;
  baseQuaternion: THREE.Quaternion;
  baseStretch: THREE.Vector3;
  baseVisibility: boolean;
  baseUvAttribute?: THREE.BufferAttribute;
  baseUvArray?: Float32Array;
}

export interface BlockymodelAnimationRig {
  bindings: BlockymodelAnimationBinding[];
  bindingsByName: Map<string, BlockymodelAnimationBinding[]>;
  textureSize?: TextureDimensions;
}

function cloneUvArray(attribute: THREE.BufferAttribute | undefined): Float32Array | undefined {
  if (!attribute) {
    return undefined;
  }
  const source = attribute.array;
  if (!(source instanceof Float32Array)) {
    return new Float32Array(Array.from(source as ArrayLike<number>));
  }
  return source.slice();
}

export function createAnimationBinding(
  nodeName: string,
  isPiece: boolean,
  pivot: THREE.Object3D,
  mesh: THREE.Mesh | null,
): BlockymodelAnimationBinding {
  const uvAttribute = mesh?.geometry.getAttribute("uv");
  const bufferAttribute = uvAttribute instanceof THREE.BufferAttribute ? uvAttribute : undefined;

  return {
    nodeName,
    isPiece,
    pivot,
    mesh,
    basePosition: pivot.position.clone(),
    baseQuaternion: pivot.quaternion.clone(),
    baseStretch: mesh ? mesh.scale.clone() : new THREE.Vector3(1, 1, 1),
    baseVisibility: mesh?.visible ?? true,
    baseUvAttribute: bufferAttribute,
    baseUvArray: cloneUvArray(bufferAttribute),
  };
}

export function registerAnimationBinding(
  rig: BlockymodelAnimationRig,
  binding: BlockymodelAnimationBinding,
): void {
  rig.bindings.push(binding);
  const existing = rig.bindingsByName.get(binding.nodeName);
  if (existing) {
    existing.push(binding);
    return;
  }
  rig.bindingsByName.set(binding.nodeName, [binding]);
}

export function createAnimationRig(textureSize?: TextureDimensions): BlockymodelAnimationRig {
  return {
    bindings: [],
    bindingsByName: new Map<string, BlockymodelAnimationBinding[]>(),
    textureSize,
  };
}

export function resetBindingUvOffset(binding: BlockymodelAnimationBinding): void {
  if (!binding.baseUvAttribute || !binding.baseUvArray) {
    return;
  }
  const target = binding.baseUvAttribute.array;
  if (!(target instanceof Float32Array)) {
    return;
  }
  target.set(binding.baseUvArray);
  binding.baseUvAttribute.needsUpdate = true;
}

export function applyBindingUvOffset(
  binding: BlockymodelAnimationBinding,
  offsetX: number,
  offsetY: number,
  textureSize: TextureDimensions | undefined,
): void {
  if (!binding.baseUvAttribute || !binding.baseUvArray || !textureSize) {
    return;
  }
  if (textureSize.width <= 0 || textureSize.height <= 0) {
    return;
  }

  const target = binding.baseUvAttribute.array;
  if (!(target instanceof Float32Array)) {
    return;
  }

  const roundedX = Math.round(offsetX);
  const roundedY = Math.round(offsetY);
  const uOffset = roundedX / textureSize.width;
  const vOffset = roundedY / textureSize.height;

  for (let index = 0; index < binding.baseUvArray.length; index += 2) {
    target[index] = binding.baseUvArray[index] + uOffset;
    target[index + 1] = binding.baseUvArray[index + 1] - vOffset;
  }

  binding.baseUvAttribute.needsUpdate = true;
}

export function resetAnimationBinding(binding: BlockymodelAnimationBinding): void {
  binding.pivot.position.copy(binding.basePosition);
  binding.pivot.quaternion.copy(binding.baseQuaternion);

  if (!binding.mesh) {
    return;
  }

  binding.mesh.scale.copy(binding.baseStretch);
  binding.mesh.visible = binding.baseVisibility;
  resetBindingUvOffset(binding);
}

export function resetAnimationRig(rig: BlockymodelAnimationRig): void {
  for (const binding of rig.bindings) {
    resetAnimationBinding(binding);
  }
}
