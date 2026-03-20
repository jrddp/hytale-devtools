import type { BlockymodelUvFace } from "./blockymodelTypes";

export interface TextureDimensions {
  width: number;
  height: number;
}

export type UvPair = [number, number];

type UvRectPixels = [number, number, number, number];

function swap2(values: [number, number]): [number, number] {
  return [values[1], values[0]];
}

function buildUvRectPixels(
  layout: BlockymodelUvFace,
  faceWidth: number,
  faceHeight: number,
): UvRectPixels {
  const uvSize: [number, number] = [faceWidth, faceHeight];
  const uvMirror: [number, number] = [layout.mirror.x ? -1 : 1, layout.mirror.y ? -1 : 1];
  const uvOffset: [number, number] = [layout.offset.x, layout.offset.y];

  switch (layout.angle) {
    case 90: {
      const swappedSize = swap2(uvSize);
      const swappedMirror = swap2(uvMirror);
      swappedMirror[0] *= -1;
      return [
        uvOffset[0],
        uvOffset[1] + swappedSize[1] * swappedMirror[1],
        uvOffset[0] + swappedSize[0] * swappedMirror[0],
        uvOffset[1],
      ];
    }
    case 270: {
      const swappedSize = swap2(uvSize);
      const swappedMirror = swap2(uvMirror);
      swappedMirror[1] *= -1;
      return [
        uvOffset[0] + swappedSize[0] * swappedMirror[0],
        uvOffset[1],
        uvOffset[0],
        uvOffset[1] + swappedSize[1] * swappedMirror[1],
      ];
    }
    case 180:
      return [
        uvOffset[0] + uvSize[0] * -uvMirror[0],
        uvOffset[1] + uvSize[1] * -uvMirror[1],
        uvOffset[0],
        uvOffset[1],
      ];
    case 0:
    default:
      return [
        uvOffset[0],
        uvOffset[1],
        uvOffset[0] + uvSize[0] * uvMirror[0],
        uvOffset[1] + uvSize[1] * uvMirror[1],
      ];
  }
}

function pixelToU(value: number, width: number): number {
  return value / width;
}

function pixelToV(value: number, height: number): number {
  return 1 - value / height;
}

function rotateUvsClockwise(
  corners: [UvPair, UvPair, UvPair, UvPair],
  angle: 0 | 90 | 180 | 270,
): [UvPair, UvPair, UvPair, UvPair] {
  const steps = (angle / 90) % 4;
  if (steps === 0) {
    return corners;
  }

  const rotated = [...corners] as [UvPair, UvPair, UvPair, UvPair];
  for (let index = 0; index < 4; index += 1) {
    rotated[index] = corners[(index + steps) % 4];
  }
  return rotated;
}

export function buildVertexUvs(
  layout: BlockymodelUvFace | undefined,
  faceWidth: number,
  faceHeight: number,
  texture: TextureDimensions | undefined,
): [UvPair, UvPair, UvPair, UvPair] {
  if (!layout || !texture || texture.width <= 0 || texture.height <= 0) {
    return [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
  }

  const [x0, y0, x1, y1] = buildUvRectPixels(layout, faceWidth, faceHeight);
  const u0 = pixelToU(x0, texture.width);
  const u1 = pixelToU(x1, texture.width);
  const v0 = pixelToV(y0, texture.height);
  const v1 = pixelToV(y1, texture.height);

  const baseCorners: [UvPair, UvPair, UvPair, UvPair] = [
    [u0, v1],
    [u1, v1],
    [u1, v0],
    [u0, v0],
  ];

  return rotateUvsClockwise(baseCorners, layout.angle);
}
