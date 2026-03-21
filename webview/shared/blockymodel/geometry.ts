import * as THREE from "three";
import { buildVertexUvs, type TextureDimensions } from "./uv";
import type {
  BlockymodelQuadNormal,
  BlockymodelTextureLayout,
  BlockymodelUvDirection,
  BlockymodelVector3,
} from "./blockymodelTypes";

type Vec3Tuple = [number, number, number];

interface FaceSpec {
  direction: BlockymodelUvDirection;
  normal: Vec3Tuple;
  corners: [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple];
  faceWidth: number;
  faceHeight: number;
}

const BOX_FACE_ORDER: BlockymodelUvDirection[] = ["back", "front", "left", "right", "top", "bottom"];

const QUAD_DIRECTION_BY_NORMAL: Record<BlockymodelQuadNormal, BlockymodelUvDirection> = {
  "+X": "right",
  "-X": "left",
  "+Y": "top",
  "-Y": "bottom",
  "+Z": "front",
  "-Z": "back",
};

function createFaceSpecs(size: BlockymodelVector3): Record<BlockymodelUvDirection, FaceSpec> {
  const halfX = Math.abs(size.x) / 2;
  const halfY = Math.abs(size.y) / 2;
  const halfZ = Math.abs(size.z) / 2;
  const absX = Math.abs(size.x);
  const absY = Math.abs(size.y);
  const absZ = Math.abs(size.z);

  return {
    front: {
      direction: "front",
      normal: [0, 0, 1],
      corners: [
        [-halfX, -halfY, halfZ],
        [halfX, -halfY, halfZ],
        [halfX, halfY, halfZ],
        [-halfX, halfY, halfZ],
      ],
      faceWidth: absX,
      faceHeight: absY,
    },
    back: {
      direction: "back",
      normal: [0, 0, -1],
      corners: [
        [halfX, -halfY, -halfZ],
        [-halfX, -halfY, -halfZ],
        [-halfX, halfY, -halfZ],
        [halfX, halfY, -halfZ],
      ],
      faceWidth: absX,
      faceHeight: absY,
    },
    left: {
      direction: "left",
      normal: [-1, 0, 0],
      corners: [
        [-halfX, -halfY, -halfZ],
        [-halfX, -halfY, halfZ],
        [-halfX, halfY, halfZ],
        [-halfX, halfY, -halfZ],
      ],
      faceWidth: absZ,
      faceHeight: absY,
    },
    right: {
      direction: "right",
      normal: [1, 0, 0],
      corners: [
        [halfX, -halfY, halfZ],
        [halfX, -halfY, -halfZ],
        [halfX, halfY, -halfZ],
        [halfX, halfY, halfZ],
      ],
      faceWidth: absZ,
      faceHeight: absY,
    },
    top: {
      direction: "top",
      normal: [0, 1, 0],
      corners: [
        [-halfX, halfY, halfZ],
        [halfX, halfY, halfZ],
        [halfX, halfY, -halfZ],
        [-halfX, halfY, -halfZ],
      ],
      faceWidth: absX,
      faceHeight: absZ,
    },
    bottom: {
      direction: "bottom",
      normal: [0, -1, 0],
      corners: [
        [-halfX, -halfY, -halfZ],
        [halfX, -halfY, -halfZ],
        [halfX, -halfY, halfZ],
        [-halfX, -halfY, halfZ],
      ],
      faceWidth: absX,
      faceHeight: absZ,
    },
  };
}

function appendFace(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
  spec: FaceSpec,
  textureLayout: BlockymodelTextureLayout,
  textureSize: TextureDimensions | undefined,
  uvDirectionOverride?: BlockymodelUvDirection,
): void {
  const layout = textureLayout[uvDirectionOverride ?? spec.direction];
  const faceUvs = buildVertexUvs(layout, spec.faceWidth, spec.faceHeight, textureSize);
  const baseVertex = positions.length / 3;

  for (let index = 0; index < 4; index += 1) {
    const vertex = spec.corners[index];
    positions.push(vertex[0], vertex[1], vertex[2]);
    normals.push(spec.normal[0], spec.normal[1], spec.normal[2]);
    uvs.push(faceUvs[index][0], faceUvs[index][1]);
  }

  indices.push(baseVertex, baseVertex + 1, baseVertex + 2, baseVertex, baseVertex + 2, baseVertex + 3);
}

function hasTextureLayout(textureLayout: BlockymodelTextureLayout): boolean {
  return Object.values(textureLayout).some(value => value !== undefined);
}

function createGeometry(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
): THREE.BufferGeometry | null {
  if (indices.length === 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildBoxGeometry(
  size: BlockymodelVector3,
  textureLayout: BlockymodelTextureLayout,
  textureSize: TextureDimensions | undefined,
): THREE.BufferGeometry | null {
  const specs = createFaceSpecs(size);
  const hasLayout = hasTextureLayout(textureLayout);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const direction of BOX_FACE_ORDER) {
    if (hasLayout && !textureLayout[direction]) {
      continue;
    }

    appendFace(positions, normals, uvs, indices, specs[direction], textureLayout, textureSize);
  }

  return createGeometry(positions, normals, uvs, indices);
}

export function buildQuadGeometry(
  size: BlockymodelVector3,
  normal: BlockymodelQuadNormal,
  textureLayout: BlockymodelTextureLayout,
  textureSize: TextureDimensions | undefined,
): THREE.BufferGeometry | null {
  const specs = createFaceSpecs(size);
  const direction = QUAD_DIRECTION_BY_NORMAL[normal];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  appendFace(positions, normals, uvs, indices, specs[direction], textureLayout, textureSize, "front");
  return createGeometry(positions, normals, uvs, indices);
}
