import {
  BLOCKYANIM_FORMAT_VERSION,
  BLOCKYANIM_NODE_CHANNELS,
  isBlockyAnimDeltaForChannel,
  isBlockyAnimFrameIndex,
  isBlockyAnimInterpolationType,
  type BlockyAnimFile,
  type BlockyAnimKeyframeForChannel,
  type BlockyAnimNodeAnimation,
  type BlockyAnimNodeChannel,
} from "./blockyanimTypes";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseChannelKeyframes<TChannel extends BlockyAnimNodeChannel>(
  nodeName: string,
  channel: TChannel,
  value: unknown,
): BlockyAnimKeyframeForChannel<TChannel>[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`Animation node "${nodeName}" channel "${channel}" must be an array.`);
  }

  const keyframes: BlockyAnimKeyframeForChannel<TChannel>[] = [];
  for (const entry of value) {
    if (!isObjectRecord(entry)) {
      throw new Error(`Animation node "${nodeName}" channel "${channel}" contains an invalid keyframe.`);
    }
    if (!isBlockyAnimFrameIndex(entry.time)) {
      throw new Error(`Animation node "${nodeName}" channel "${channel}" contains an invalid keyframe time.`);
    }
    if (!isBlockyAnimDeltaForChannel(channel, entry.delta)) {
      throw new Error(`Animation node "${nodeName}" channel "${channel}" contains an invalid delta.`);
    }
    if (entry.interpolationType !== undefined && !isBlockyAnimInterpolationType(entry.interpolationType)) {
      throw new Error(`Animation node "${nodeName}" channel "${channel}" contains an invalid interpolation.`);
    }

    keyframes.push({
      time: entry.time,
      delta: entry.delta,
      interpolationType: entry.interpolationType,
    } as BlockyAnimKeyframeForChannel<TChannel>);
  }

  keyframes.sort((left, right) => left.time - right.time);
  return keyframes;
}

function parseNodeAnimation(nodeName: string, value: unknown): BlockyAnimNodeAnimation {
  if (!isObjectRecord(value)) {
    throw new Error(`Animation node "${nodeName}" must be an object.`);
  }

  const parsed: BlockyAnimNodeAnimation = {};
  for (const channel of BLOCKYANIM_NODE_CHANNELS) {
    const keyframes = parseChannelKeyframes(nodeName, channel, value[channel]);
    if (value[channel] !== undefined || keyframes.length > 0) {
      parsed[channel] = keyframes as never;
    }
  }
  return parsed;
}

export function parseBlockyanimFile(value: unknown): BlockyAnimFile {
  if (!isObjectRecord(value)) {
    throw new Error("Blockyanim file must be an object.");
  }
  if (!isBlockyAnimFrameIndex(value.duration)) {
    throw new Error("Blockyanim duration must be a non-negative integer frame count.");
  }
  if (typeof value.holdLastKeyframe !== "boolean") {
    throw new Error("Blockyanim holdLastKeyframe must be a boolean.");
  }
  if (value.formatVersion !== undefined && value.formatVersion !== BLOCKYANIM_FORMAT_VERSION) {
    throw new Error(`Unsupported blockyanim format version "${String(value.formatVersion)}".`);
  }
  if (!isObjectRecord(value.nodeAnimations)) {
    throw new Error("Blockyanim nodeAnimations must be an object.");
  }

  const nodeAnimations: BlockyAnimFile["nodeAnimations"] = {};
  for (const [nodeName, nodeAnimation] of Object.entries(value.nodeAnimations)) {
    nodeAnimations[nodeName] = parseNodeAnimation(nodeName, nodeAnimation);
  }

  return {
    formatVersion: BLOCKYANIM_FORMAT_VERSION,
    duration: value.duration,
    holdLastKeyframe: value.holdLastKeyframe,
    nodeAnimations,
  };
}
