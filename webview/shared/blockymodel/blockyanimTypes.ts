/**
 * Type definitions for Hytale `*.blockyanim` files.
 *
 * These types are aligned to plugin behavior in:
 * - `src/blockyanim.ts`
 * - `src/animations.ts` (runtime channel behavior notes)
 */

/**
 * Fixed file format version used by the plugin.
 */
export const BLOCKYANIM_FORMAT_VERSION = 1 as const;

/**
 * Frame rate used by the format.
 *
 * Quirk: file times are frame indices at 60 FPS, not seconds.
 * Plugin import divides by 60 (`time / FPS`), and export rounds from seconds
 * with `Math.round(seconds * FPS)`.
 */
export const BLOCKYANIM_FPS = 60 as const;

/**
 * Channel interpolation labels persisted in file.
 *
 * Mapping quirk:
 * - `"smooth"` maps to Blockbench `"catmullrom"`
 * - `"linear"` maps to Blockbench `"linear"`
 */
export const BLOCKYANIM_INTERPOLATION_TYPES = ["smooth", "linear"] as const;
export type BlockyAnimInterpolationType = (typeof BLOCKYANIM_INTERPOLATION_TYPES)[number];

/**
 * Optional mapping constants for tooling that bridges Blockbench interpolation ids.
 */
export const BLOCKYANIM_TO_BLOCKBENCH_INTERPOLATION = {
  smooth: "catmullrom",
  linear: "linear",
} as const;

export const BLOCKBENCH_TO_BLOCKYANIM_INTERPOLATION = {
  catmullrom: "smooth",
  linear: "linear",
} as const;

/**
 * Known per-node animation channel keys in the file.
 */
export const BLOCKYANIM_NODE_CHANNELS = [
  "position",
  "orientation",
  "shapeStretch",
  "shapeVisible",
  "shapeUvOffset",
] as const;
export type BlockyAnimNodeChannel = (typeof BLOCKYANIM_NODE_CHANNELS)[number];

/**
 * Generic 2D vector delta.
 */
export interface BlockyAnimVector2 {
  x: number;
  y: number;
}

/**
 * Generic 3D vector delta.
 */
export interface BlockyAnimVector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Quaternion payload used by orientation keyframes.
 */
export interface BlockyAnimQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Generic keyframe shape.
 * `time` and `duration` are frame indices in `BLOCKYANIM_FPS`.
 */
export interface BlockyAnimKeyframe<TDelta> {
  /**
   * Keyframe index in frames (0-based timeline frame).
   */
  time: number;
  /**
   * Channel payload for this frame.
   */
  delta: TDelta;
  /**
   * Optional interpolation mode for segment after this keyframe.
   */
  interpolationType?: BlockyAnimInterpolationType;
}

/**
 * Position channel keyframe.
 */
export type BlockyAnimPositionKeyframe = BlockyAnimKeyframe<BlockyAnimVector3>;

/**
 * Orientation channel keyframe in quaternion form.
 */
export type BlockyAnimOrientationKeyframe = BlockyAnimKeyframe<BlockyAnimQuaternion>;

/**
 * Stretch channel keyframe (scale-like multipliers, where 1 is neutral).
 */
export type BlockyAnimShapeStretchKeyframe = BlockyAnimKeyframe<BlockyAnimVector3>;

/**
 * Visibility channel keyframe.
 */
export type BlockyAnimShapeVisibleKeyframe = BlockyAnimKeyframe<boolean>;

/**
 * UV offset channel keyframe.
 *
 * Quirk: Y axis is inverted relative to Blockbench UI/runtime values.
 * - File stores `delta.y` as negative of Blockbench keyframe Y.
 * - Import does `uiY = -fileY`; export does `fileY = -uiY`.
 */
export type BlockyAnimShapeUvOffsetKeyframe = BlockyAnimKeyframe<BlockyAnimVector2>;

/**
 * Union of all channel keyframe payloads.
 */
export type BlockyAnimAnyKeyframe =
  | BlockyAnimPositionKeyframe
  | BlockyAnimOrientationKeyframe
  | BlockyAnimShapeStretchKeyframe
  | BlockyAnimShapeVisibleKeyframe
  | BlockyAnimShapeUvOffsetKeyframe;

/**
 * Channel to keyframe delta map.
 */
export interface BlockyAnimChannelDeltaMap {
  position: BlockyAnimVector3;
  orientation: BlockyAnimQuaternion;
  shapeStretch: BlockyAnimVector3;
  shapeVisible: boolean;
  shapeUvOffset: BlockyAnimVector2;
}

/**
 * Channel-specific keyframe type helper.
 */
export type BlockyAnimKeyframeForChannel<TChannel extends BlockyAnimNodeChannel> = BlockyAnimKeyframe<
  BlockyAnimChannelDeltaMap[TChannel]
>;

/**
 * All keyframes for one animated node name.
 *
 * Plugin parser accepts omitted channels.
 * Plugin exporter often writes all channel arrays for animated nodes, even empty ones.
 */
export interface BlockyAnimNodeAnimation {
  position?: BlockyAnimPositionKeyframe[];
  orientation?: BlockyAnimOrientationKeyframe[];
  shapeStretch?: BlockyAnimShapeStretchKeyframe[];
  shapeVisible?: BlockyAnimShapeVisibleKeyframe[];
  shapeUvOffset?: BlockyAnimShapeUvOffsetKeyframe[];
}

/**
 * Mapping from node name to animation channel data.
 */
export type BlockyAnimNodeAnimations = Record<string, BlockyAnimNodeAnimation>;

/**
 * Animation file root.
 */
export interface BlockyAnimFile {
  formatVersion: typeof BLOCKYANIM_FORMAT_VERSION;
  /**
   * Total animation length in frames at `BLOCKYANIM_FPS`.
   */
  duration: number;
  /**
   * Loop behavior flag.
   * - `true`: hold final frame
   * - `false`: loop
   */
  holdLastKeyframe: boolean;
  nodeAnimations: BlockyAnimNodeAnimations;
}

/**
 * Union of all legal delta payloads.
 */
export type BlockyAnimDelta =
  | BlockyAnimVector2
  | BlockyAnimVector3
  | BlockyAnimQuaternion
  | boolean;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Guard for frame-index-like numeric values.
 */
export function isBlockyAnimFrameIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

/**
 * Guard for interpolation type strings.
 */
export function isBlockyAnimInterpolationType(value: unknown): value is BlockyAnimInterpolationType {
  return typeof value === "string" && (BLOCKYANIM_INTERPOLATION_TYPES as readonly string[]).includes(value);
}

/**
 * Guard for 2D UV offset deltas.
 */
export function isBlockyAnimVector2Delta(value: unknown): value is BlockyAnimVector2 {
  if (!value || typeof value !== "object") {
    return false;
  }
  const maybe = value as Partial<BlockyAnimVector2>;
  return isFiniteNumber(maybe.x) && isFiniteNumber(maybe.y);
}

/**
 * Guard for 3D vector deltas.
 */
export function isBlockyAnimVector3Delta(value: unknown): value is BlockyAnimVector3 {
  if (!value || typeof value !== "object") {
    return false;
  }
  const maybe = value as Partial<BlockyAnimVector3>;
  return isFiniteNumber(maybe.x) && isFiniteNumber(maybe.y) && isFiniteNumber(maybe.z);
}

/**
 * Guard for quaternion deltas.
 */
export function isBlockyAnimQuaternionDelta(value: unknown): value is BlockyAnimQuaternion {
  if (!value || typeof value !== "object") {
    return false;
  }
  const maybe = value as Partial<BlockyAnimQuaternion>;
  return isFiniteNumber(maybe.x) && isFiniteNumber(maybe.y) && isFiniteNumber(maybe.z) && isFiniteNumber(maybe.w);
}

/**
 * Guard for visibility deltas.
 */
export function isBlockyAnimVisibilityDelta(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * Guard for channel delta payload by channel key.
 */
export function isBlockyAnimDeltaForChannel<TChannel extends BlockyAnimNodeChannel>(
  channel: TChannel,
  delta: unknown,
): delta is BlockyAnimChannelDeltaMap[TChannel] {
  switch (channel) {
    case "position":
      return isBlockyAnimVector3Delta(delta);
    case "orientation":
      return isBlockyAnimQuaternionDelta(delta);
    case "shapeStretch":
      return isBlockyAnimVector3Delta(delta);
    case "shapeVisible":
      return isBlockyAnimVisibilityDelta(delta);
    case "shapeUvOffset":
      return isBlockyAnimVector2Delta(delta);
    default:
      return false;
  }
}

/**
 * Broad guard for any legal delta payload.
 */
export function isBlockyAnimDelta(value: unknown): value is BlockyAnimDelta {
  return (
    isBlockyAnimVisibilityDelta(value) ||
    isBlockyAnimQuaternionDelta(value) ||
    isBlockyAnimVector3Delta(value) ||
    isBlockyAnimVector2Delta(value)
  );
}
