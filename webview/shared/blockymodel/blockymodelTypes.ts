export type BlockymodelFormat = "character" | "prop";
export type BlockymodelLod = "auto";
export type BlockymodelQuadNormal = "+X" | "+Y" | "+Z" | "-X" | "-Y" | "-Z";
export type BlockymodelUvAngle = 0 | 90 | 180 | 270;
export type BlockymodelUvDirection = "back" | "front" | "left" | "right" | "top" | "bottom";
export type BlockymodelShadingMode = "flat" | "standard" | "fullbright" | "reflective";

export interface BlockymodelFile {
  nodes: BlockymodelNode[];
  format?: BlockymodelFormat;
  lod?: BlockymodelLod;
}

export interface BlockymodelVector2 {
  x: number;
  y: number;
}

export interface BlockymodelVector3 {
  x: number;
  y: number;
  z: number;
}

export interface BlockymodelQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface BlockymodelUvFace {
  offset: BlockymodelVector2;
  mirror: {
    x: boolean;
    y: boolean;
  };
  angle: BlockymodelUvAngle;
}

export type BlockymodelTextureLayout = Partial<
  Record<BlockymodelUvDirection, BlockymodelUvFace>
> & {
  [direction: string]: BlockymodelUvFace | undefined;
};

export interface BlockymodelShapeCommonSettings {
  isPiece?: boolean;
  isStaticBox?: true;
}

export interface BlockymodelNoneShapeSettings extends BlockymodelShapeCommonSettings {
  size?: never;
  normal?: never;
}

export interface BlockymodelBoxShapeSettings extends BlockymodelShapeCommonSettings {
  size: BlockymodelVector3;
  normal?: never;
}

export interface BlockymodelQuadSize {
  x: number;
  y: number;
  z?: number;
}

export interface BlockymodelQuadShapeSettings extends BlockymodelShapeCommonSettings {
  size: BlockymodelQuadSize;
  normal: BlockymodelQuadNormal;
}

type BlockymodelShapeBase<
  TType extends "none" | "box" | "quad",
  TSettings extends BlockymodelShapeCommonSettings,
> = {
  offset: BlockymodelVector3;
  stretch: BlockymodelVector3;
  textureLayout: BlockymodelTextureLayout;
  type: TType;
  settings: TSettings;
  unwrapMode: "custom";
  visible: boolean;
  doubleSided: boolean;
  shadingMode: BlockymodelShadingMode;
};

export type BlockymodelNoneShape = BlockymodelShapeBase<"none", BlockymodelNoneShapeSettings>;
export type BlockymodelBoxShape = BlockymodelShapeBase<"box", BlockymodelBoxShapeSettings>;
export type BlockymodelQuadShape = BlockymodelShapeBase<"quad", BlockymodelQuadShapeSettings>;
export type BlockymodelShape =
  | BlockymodelNoneShape
  | BlockymodelBoxShape
  | BlockymodelQuadShape;

export interface BlockymodelNode {
  id: string;
  name: string;
  position: BlockymodelVector3;
  orientation: BlockymodelQuaternion;
  shape: BlockymodelShape;
  children?: BlockymodelNode[];
}
