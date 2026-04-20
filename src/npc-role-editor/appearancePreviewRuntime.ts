import type { AssetCacheRuntime } from "../asset-cache/assetCacheRuntime";
import type { RegisteredAssetsIndexShard } from "../shared/indexTypes";
import {
  resolveModelAnimationPreviewFromModelAsset,
  resolveModelAnimationSetIdsFromModelAsset,
  resolveModelPreviewFromModelAsset,
} from "../shared/modelPreviewResolution";
import type {
  AnimationPreviewState,
  BaseModelPreviewState,
  ModelPreviewState,
} from "../shared/modelPreviewTypes";

export type ResolvedNpcAppearanceBaseState = {
  basePreview?: BaseModelPreviewState;
  animationIds: string[];
  idleAnimationPreview?: AnimationPreviewState;
};

export type ResolvedNpcAppearanceState = {
  preview: ModelPreviewState;
  animationIds: string[];
};

export async function resolveNpcAppearanceBaseState(
  assetName: string | undefined,
  runtime: AssetCacheRuntime,
  modelAssetIndex: RegisteredAssetsIndexShard | undefined,
): Promise<ResolvedNpcAppearanceBaseState> {
  const rootAsset = await loadNpcAppearanceModelAsset(assetName, modelAssetIndex, runtime);
  if (!rootAsset || !modelAssetIndex) {
    return {
      basePreview: undefined,
      animationIds: [],
      idleAnimationPreview: undefined,
    };
  }

  const loadParentModelAsset = async (parentAssetName: string) =>
    await loadIndexedModelAsset(parentAssetName, modelAssetIndex, runtime);
  const [resolvedPreview, animationIds] = await Promise.all([
    resolveModelPreviewFromModelAsset(rootAsset, runtime, loadParentModelAsset, "Idle"),
    resolveModelAnimationSetIdsFromModelAsset(rootAsset, loadParentModelAsset),
  ]);
  const { basePreview, animationPreview } = splitResolvedModelPreview(resolvedPreview);

  return {
    basePreview,
    animationIds,
    idleAnimationPreview: animationPreview,
  };
}

export async function resolveNpcAppearanceAnimationPreview(
  assetName: string | undefined,
  animationSetId: string | undefined,
  runtime: AssetCacheRuntime,
  modelAssetIndex: RegisteredAssetsIndexShard | undefined,
): Promise<AnimationPreviewState | undefined> {
  const trimmedAnimationSetId = animationSetId?.trim();
  if (!trimmedAnimationSetId) {
    return undefined;
  }

  const rootAsset = await loadNpcAppearanceModelAsset(assetName, modelAssetIndex, runtime);
  if (!rootAsset || !modelAssetIndex) {
    return undefined;
  }

  const loadParentModelAsset = async (parentAssetName: string) =>
    await loadIndexedModelAsset(parentAssetName, modelAssetIndex, runtime);
  return await resolveModelAnimationPreviewFromModelAsset(
    rootAsset,
    loadParentModelAsset,
    trimmedAnimationSetId,
    runtime,
  );
}

export async function resolveNpcAppearanceState(
  assetName: string | undefined,
  runtime: AssetCacheRuntime,
  modelAssetIndex: RegisteredAssetsIndexShard | undefined,
  animationSetId = "Idle",
): Promise<ResolvedNpcAppearanceState> {
  const baseState = await resolveNpcAppearanceBaseState(assetName, runtime, modelAssetIndex);
  const animationPreview =
    animationSetId === "Idle"
      ? baseState.idleAnimationPreview
      : await resolveNpcAppearanceAnimationPreview(
          assetName,
          animationSetId,
          runtime,
          modelAssetIndex,
        );

  return {
    preview: combineAppearancePreview(baseState.basePreview, animationPreview),
    animationIds: baseState.animationIds,
  };
}

export async function resolveNpcAppearancePreview(
  assetName: string | undefined,
  runtime: AssetCacheRuntime,
  modelAssetIndex: RegisteredAssetsIndexShard | undefined,
  animationSetId = "Idle",
): Promise<ModelPreviewState> {
  return (await resolveNpcAppearanceState(assetName, runtime, modelAssetIndex, animationSetId)).preview;
}

function combineAppearancePreview(
  basePreview: BaseModelPreviewState | undefined,
  animationPreview: AnimationPreviewState | undefined,
): ModelPreviewState {
  if (!basePreview?.model) {
    return { type: "none" };
  }

  return animationPreview ? { ...basePreview, ...animationPreview } : basePreview;
}

function splitResolvedModelPreview(preview: ModelPreviewState): {
  basePreview?: BaseModelPreviewState;
  animationPreview?: AnimationPreviewState;
} {
  if (preview.type !== "Model" || !preview.model) {
    return {
      basePreview: undefined,
      animationPreview: undefined,
    };
  }

  return {
    basePreview: {
      type: "Model",
      model: preview.model,
      texture: preview.texture,
      attachments: preview.attachments,
    },
    animationPreview: preview.animation
      ? {
          animation: preview.animation,
          animationSpeed: preview.animationSpeed,
          animationLooping: preview.animationLooping,
        }
      : undefined,
  };
}

async function loadNpcAppearanceModelAsset(
  assetName: string | undefined,
  modelAssetIndex: RegisteredAssetsIndexShard | undefined,
  runtime: AssetCacheRuntime,
): Promise<Record<string, unknown> | undefined> {
  const trimmedAssetName = assetName?.trim();
  if (!trimmedAssetName || !modelAssetIndex) {
    return undefined;
  }

  return await loadIndexedModelAsset(trimmedAssetName, modelAssetIndex, runtime);
}

async function loadIndexedModelAsset(
  assetName: string,
  modelAssetIndex: RegisteredAssetsIndexShard,
  runtime: AssetCacheRuntime,
): Promise<Record<string, unknown> | undefined> {
  const metadata = modelAssetIndex.values[assetName];
  if (!metadata?.sourcedFromFile) {
    return undefined;
  }

  const asset = await runtime.loadAssetByPath(metadata.sourcedFromFile);
  return asset?.contentType === "json" && isRecord(asset.rawJson) ? asset.rawJson : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
