import * as THREE from "three";
import { buildBoxGeometry, buildQuadGeometry } from "./geometry";
import { createMaterialFactory } from "./materials";
import type {
  BlockymodelBoxShape,
  BlockymodelFile,
  BlockymodelNode,
  BlockymodelQuadNormal,
  BlockymodelQuadShape,
  BlockymodelShape,
  BlockymodelVector3,
} from "./blockymodelTypes";
import type { TextureDimensions } from "./uv";

function toVector3(value: Partial<BlockymodelVector3> | undefined, fallback = 0): BlockymodelVector3 {
  return {
    x: typeof value?.x === "number" ? value.x : fallback,
    y: typeof value?.y === "number" ? value.y : fallback,
    z: typeof value?.z === "number" ? value.z : fallback,
  };
}

function toTextureDimensions(texture: THREE.Texture | undefined): TextureDimensions | undefined {
  const image = texture?.image as { width?: number; height?: number } | undefined;
  if (typeof image?.width !== "number" || typeof image?.height !== "number") {
    return undefined;
  }

  return { width: image.width, height: image.height };
}

function reconstructQuadSize(shape: BlockymodelQuadShape): BlockymodelVector3 {
  const source = shape.settings.size;
  const normal = (shape.settings.normal ?? "+Z") as BlockymodelQuadNormal;
  const x = Math.abs(source.x);
  const y = Math.abs(source.y);

  if (normal.endsWith("X")) {
    return { x: 0, y, z: x };
  }
  if (normal.endsWith("Y")) {
    return { x, y: 0, z: y };
  }
  return { x, y, z: 0 };
}

function createMeshFromShape(
  shape: BlockymodelShape,
  textureSize: TextureDimensions | undefined,
  getMaterial: (mode: BlockymodelShape["shadingMode"], doubleSided: boolean) => THREE.Material,
): THREE.Mesh | null {
  let geometry: THREE.BufferGeometry | null = null;

  if (shape.type === "box") {
    const boxShape = shape as BlockymodelBoxShape;
    if (!boxShape.settings.size) {
      return null;
    }
    geometry = buildBoxGeometry(boxShape.settings.size, boxShape.textureLayout, textureSize);
  } else if (shape.type === "quad") {
    const quadShape = shape as BlockymodelQuadShape;
    if (!quadShape.settings.size) {
      return null;
    }
    geometry = buildQuadGeometry(
      reconstructQuadSize(quadShape),
      quadShape.settings.normal ?? "+Z",
      quadShape.textureLayout,
      textureSize,
    );
  }

  if (!geometry) {
    return null;
  }

  const material = getMaterial(shape.shadingMode, shape.doubleSided);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = shape.visible !== false;

  const offset = toVector3(shape.offset, 0);
  mesh.position.set(offset.x, offset.y, offset.z);

  const stretch = toVector3(shape.stretch, 1);
  mesh.scale.set(stretch.x, stretch.y, stretch.z);
  return mesh;
}

function buildNode(
  node: BlockymodelNode,
  parent: THREE.Object3D,
  parentShapeOffset: THREE.Vector3,
  textureSize: TextureDimensions | undefined,
  getMaterial: (mode: BlockymodelShape["shadingMode"], doubleSided: boolean) => THREE.Material,
): void {
  const pivot = new THREE.Object3D();
  pivot.name = node.name;

  const position = toVector3(node.position, 0);
  pivot.position.set(
    position.x + parentShapeOffset.x,
    position.y + parentShapeOffset.y,
    position.z + parentShapeOffset.z,
  );

  pivot.quaternion.set(
    node.orientation.x,
    node.orientation.y,
    node.orientation.z,
    node.orientation.w,
  ).normalize();
  parent.add(pivot);

  if (node.shape && node.shape.type !== "none") {
    const mesh = createMeshFromShape(node.shape, textureSize, getMaterial);
    if (mesh) {
      mesh.name = `${node.name}_shape`;
      pivot.add(mesh);
    }
  }

  const shapeOffsetForChildren = node.shape ? toVector3(node.shape.offset, 0) : { x: 0, y: 0, z: 0 };
  const nextParentOffset = new THREE.Vector3(
    shapeOffsetForChildren.x,
    shapeOffsetForChildren.y,
    shapeOffsetForChildren.z,
  );

  for (const child of node.children ?? []) {
    buildNode(child, pivot, nextParentOffset, textureSize, getMaterial);
  }
}

export function buildBlockymodelObject3D(
  model: BlockymodelFile,
  texture?: THREE.Texture,
): THREE.Object3D {
  const root = new THREE.Group();
  root.name = "BlockymodelRoot";

  const getMaterial = createMaterialFactory(texture);
  const textureSize = toTextureDimensions(texture);
  const zeroOffset = new THREE.Vector3(0, 0, 0);

  for (const node of model.nodes ?? []) {
    buildNode(node, root, zeroOffset, textureSize, getMaterial);
  }

  return root;
}
