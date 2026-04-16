import * as THREE from "three";
import {
  BLOCKYANIM_FPS,
  type BlockyAnimFile,
  type BlockyAnimKeyframe,
  type BlockyAnimOrientationKeyframe,
  type BlockyAnimPositionKeyframe,
  type BlockyAnimShapeStretchKeyframe,
  type BlockyAnimShapeUvOffsetKeyframe,
  type BlockyAnimShapeVisibleKeyframe,
  type BlockyAnimVector2,
  type BlockyAnimVector3,
} from "./blockyanimTypes";
import {
  applyBindingUvOffset,
  resetAnimationRig,
  type BlockymodelAnimationBinding,
  type BlockymodelAnimationRig,
} from "./animationRig";

export interface BlockyanimController {
  setAnimation(animation: BlockyAnimFile | null): void;
  setPlaying(playing: boolean): void;
  setPlaybackRate(playbackRate: number): void;
  setLoopingOverride(loopingOverride: boolean | undefined): void;
  resetPose(): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

function weightedCubicBezier(t: number): number {
  const p0 = 0.0;
  const p1 = 0.05;
  const p2 = 0.95;
  const p3 = 1.0;

  const w0 = 2.0;
  const w1 = 1.0;
  const w2 = 2.0;
  const w3 = 1.0;

  const b0 = (1 - t) ** 3;
  const b1 = 3 * (1 - t) ** 2 * t;
  const b2 = 3 * (1 - t) * t ** 2;
  const b3 = t ** 3;

  const numerator = b0 * w0 * p0 + b1 * w1 * p1 + b2 * w2 * p2 + b3 * w3 * p3;
  const denominator = b0 * w0 + b1 * w1 + b2 * w2 + b3 * w3;

  return denominator === 0 ? t : numerator / denominator;
}

function getAnimationDurationSeconds(animation: BlockyAnimFile): number {
  return animation.duration / BLOCKYANIM_FPS;
}

function getAnimationDurationFrames(animation: BlockyAnimFile): number {
  return animation.duration;
}

function isAnimationLooping(
  animation: BlockyAnimFile,
  loopingOverride: boolean | undefined,
): boolean {
  if (loopingOverride !== undefined) {
    return loopingOverride;
  }

  return !animation.holdLastKeyframe;
}

function normalizeAnimationTime(
  animation: BlockyAnimFile,
  elapsedSeconds: number,
  loopingOverride: boolean | undefined,
): number {
  const durationSeconds = getAnimationDurationSeconds(animation);
  if (durationSeconds <= 0) {
    return 0;
  }

  if (!isAnimationLooping(animation, loopingOverride)) {
    return Math.min(Math.max(elapsedSeconds, 0), durationSeconds);
  }

  const wrapped = elapsedSeconds % durationSeconds;
  return wrapped < 0 ? wrapped + durationSeconds : wrapped;
}

function shouldEaseSegment<TDelta>(
  before: BlockyAnimKeyframe<TDelta>,
  after: BlockyAnimKeyframe<TDelta>
): boolean {
  return before.interpolationType === "smooth" && after.interpolationType === "smooth";
}

function findPreviousStepKeyframe<TDelta>(
  keyframes: BlockyAnimKeyframe<TDelta>[] | undefined,
  frameTime: number,
  durationFrames: number,
  looping: boolean
): BlockyAnimKeyframe<TDelta> | undefined {
  if (!keyframes?.length) {
    return undefined;
  }
  if (keyframes.length === 1) {
    if (!looping && frameTime < keyframes[0].time) {
      return undefined;
    }
    return keyframes[0];
  }

  let previous: BlockyAnimKeyframe<TDelta> | undefined;
  for (const keyframe of keyframes) {
    if (keyframe.time > frameTime) {
      break;
    }
    previous = keyframe;
  }
  if (previous) {
    return previous;
  }

  if (looping && durationFrames > 0) {
    return keyframes[keyframes.length - 1];
  }

  return undefined;
}

function withShiftedTime<TDelta>(
  keyframe: BlockyAnimKeyframe<TDelta>,
  time: number
): BlockyAnimKeyframe<TDelta> {
  return {
    ...keyframe,
    time,
  };
}

function findInterpolationSegment<TDelta>(
  keyframes: BlockyAnimKeyframe<TDelta>[] | undefined,
  frameTime: number,
  durationFrames: number,
  looping: boolean
): {
  before: BlockyAnimKeyframe<TDelta>;
  after?: BlockyAnimKeyframe<TDelta>;
} | null {
  if (!keyframes?.length) {
    return null;
  }
  if (keyframes.length === 1) {
    if (!looping && frameTime < keyframes[0].time) {
      return null;
    }
    return { before: keyframes[0] };
  }

  if (looping && durationFrames > 0) {
    const first = keyframes[0];
    const last = keyframes[keyframes.length - 1];

    if (frameTime < first.time) {
      return {
        before: withShiftedTime(last, last.time - durationFrames),
        after: first,
      };
    }

    for (let index = 0; index < keyframes.length - 1; index++) {
      const before = keyframes[index];
      const after = keyframes[index + 1];
      if (frameTime < after.time) {
        return { before, after };
      }
    }

    return {
      before: last,
      after: withShiftedTime(first, first.time + durationFrames),
    };
  }

  let before: BlockyAnimKeyframe<TDelta> | undefined;
  for (const keyframe of keyframes) {
    if (keyframe.time > frameTime) {
      return before ? { before, after: keyframe } : null;
    }
    before = keyframe;
  }

  return before ? { before } : null;
}

function computeSegmentT<TDelta>(
  before: BlockyAnimKeyframe<TDelta>,
  after: BlockyAnimKeyframe<TDelta>,
  frameTime: number
): number {
  const duration = after.time - before.time;
  if (duration <= 0) {
    return 1;
  }

  const linearT = THREE.MathUtils.clamp((frameTime - before.time) / duration, 0, 1);
  return shouldEaseSegment(before, after) ? weightedCubicBezier(linearT) : linearT;
}

function sampleVector3Channel(
  keyframes: BlockyAnimPositionKeyframe[] | BlockyAnimShapeStretchKeyframe[] | undefined,
  frameTime: number,
  durationFrames: number,
  looping: boolean
): BlockyAnimVector3 | undefined {
  const segment = findInterpolationSegment(keyframes, frameTime, durationFrames, looping);
  if (!segment) {
    return undefined;
  }
  if (!segment.after) {
    return segment.before.delta;
  }

  const t = computeSegmentT(segment.before, segment.after, frameTime);
  return {
    x: THREE.MathUtils.lerp(segment.before.delta.x, segment.after.delta.x, t),
    y: THREE.MathUtils.lerp(segment.before.delta.y, segment.after.delta.y, t),
    z: THREE.MathUtils.lerp(segment.before.delta.z, segment.after.delta.z, t),
  };
}

function sampleQuaternionChannel(
  keyframes: BlockyAnimOrientationKeyframe[] | undefined,
  frameTime: number,
  durationFrames: number,
  looping: boolean
): THREE.Quaternion | undefined {
  const segment = findInterpolationSegment(keyframes, frameTime, durationFrames, looping);
  if (!segment) {
    return undefined;
  }

  const before = new THREE.Quaternion(
    segment.before.delta.x,
    segment.before.delta.y,
    segment.before.delta.z,
    segment.before.delta.w
  ).normalize();

  if (!segment.after) {
    return before;
  }

  const after = new THREE.Quaternion(
    segment.after.delta.x,
    segment.after.delta.y,
    segment.after.delta.z,
    segment.after.delta.w
  ).normalize();
  const t = computeSegmentT(segment.before, segment.after, frameTime);
  return new THREE.Quaternion().slerpQuaternions(before, after, t).normalize();
}

function sampleVisibilityChannel(
  keyframes: BlockyAnimShapeVisibleKeyframe[] | undefined,
  frameTime: number,
  durationFrames: number,
  looping: boolean
): boolean | undefined {
  return findPreviousStepKeyframe(keyframes, frameTime, durationFrames, looping)?.delta;
}

function sampleUvOffsetChannel(
  keyframes: BlockyAnimShapeUvOffsetKeyframe[] | undefined,
  frameTime: number,
  durationFrames: number,
  looping: boolean
): BlockyAnimVector2 | undefined {
  return findPreviousStepKeyframe(keyframes, frameTime, durationFrames, looping)?.delta;
}

function applyBindingAnimation(
  binding: BlockymodelAnimationBinding,
  animation: BlockyAnimFile,
  frameTime: number,
  textureSize: BlockymodelAnimationRig["textureSize"],
  loopingOverride: boolean | undefined,
): void {
  const nodeAnimation = animation.nodeAnimations[binding.nodeName];
  if (!nodeAnimation) {
    return;
  }
  const durationFrames = getAnimationDurationFrames(animation);
  const looping = isAnimationLooping(animation, loopingOverride) && durationFrames > 0;

  const position = sampleVector3Channel(nodeAnimation.position, frameTime, durationFrames, looping);
  if (position) {
    binding.pivot.position.set(
      binding.basePosition.x + position.x,
      binding.basePosition.y + position.y,
      binding.basePosition.z + position.z
    );
  }

  const orientation = sampleQuaternionChannel(nodeAnimation.orientation, frameTime, durationFrames, looping);
  if (orientation) {
    binding.pivot.quaternion.copy(binding.baseQuaternion).multiply(orientation).normalize();
  }

  if (!binding.mesh) {
    return;
  }

  const stretch = sampleVector3Channel(nodeAnimation.shapeStretch, frameTime, durationFrames, looping);
  if (stretch) {
    binding.mesh.scale.set(
      binding.baseStretch.x * stretch.x,
      binding.baseStretch.y * stretch.y,
      binding.baseStretch.z * stretch.z
    );
  }

  const visible = sampleVisibilityChannel(nodeAnimation.shapeVisible, frameTime, durationFrames, looping);
  if (visible !== undefined) {
    binding.mesh.visible = visible;
  }

  const uvOffset = sampleUvOffsetChannel(nodeAnimation.shapeUvOffset, frameTime, durationFrames, looping);
  if (uvOffset) {
    applyBindingUvOffset(binding, uvOffset.x, -uvOffset.y, textureSize);
  }
}

export function createBlockyanimController(rig: BlockymodelAnimationRig): BlockyanimController {
  let currentAnimation: BlockyAnimFile | null = null;
  let playing = true;
  let playbackRate = 1;
  let loopingOverride: boolean | undefined;
  let elapsedSeconds = 0;

  function applyCurrentPose(): void {
    resetAnimationRig(rig);
    if (!currentAnimation) {
      return;
    }

    const frameTime =
      normalizeAnimationTime(currentAnimation, elapsedSeconds, loopingOverride) * BLOCKYANIM_FPS;
    for (const binding of rig.bindings) {
      applyBindingAnimation(binding, currentAnimation, frameTime, rig.textureSize, loopingOverride);
    }
  }

  return {
    setAnimation(animation: BlockyAnimFile | null): void {
      if (currentAnimation === animation) {
        applyCurrentPose();
        return;
      }
      currentAnimation = animation;
      elapsedSeconds = 0;
      applyCurrentPose();
    },
    setPlaying(nextPlaying: boolean): void {
      playing = nextPlaying;
    },
    setPlaybackRate(nextPlaybackRate: number): void {
      playbackRate = Number.isFinite(nextPlaybackRate) ? Math.max(0, nextPlaybackRate) : 1;
      applyCurrentPose();
    },
    setLoopingOverride(nextLoopingOverride: boolean | undefined): void {
      loopingOverride = nextLoopingOverride;
      applyCurrentPose();
    },
    resetPose(): void {
      elapsedSeconds = 0;
      resetAnimationRig(rig);
    },
    update(deltaSeconds: number): void {
      if (!currentAnimation) {
        return;
      }
      if (playing) {
        elapsedSeconds += Math.max(0, deltaSeconds) * playbackRate;
      }
      applyCurrentPose();
    },
    dispose(): void {
      currentAnimation = null;
      elapsedSeconds = 0;
      playbackRate = 1;
      loopingOverride = undefined;
      resetAnimationRig(rig);
    },
  };
}
