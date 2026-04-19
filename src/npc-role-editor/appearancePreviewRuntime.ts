import type { AssetCacheRuntime } from "../asset-cache/assetCacheRuntime";
import type { RegisteredAssetsIndexShard } from "../shared/indexTypes";
import {
  resolveModelAnimationSetIdsFromModelAsset,
  resolveModelPreviewFromModelAsset,
} from "../shared/modelPreviewResolution";
import type { ModelPreviewState } from "../shared/modelPreviewTypes";

export type ResolvedNpcAppearanceState = {
  preview: ModelPreviewState;
  animationIds: string[];
};

export async function resolveNpcAppearanceState(
  assetName: string | undefined,
  runtime: AssetCacheRuntime,
  modelAssetIndex: RegisteredAssetsIndexShard | undefined,
): Promise<ResolvedNpcAppearanceState> {
  const trimmedAssetName = assetName?.trim();
  if (!trimmedAssetName || !modelAssetIndex) {
    return {
      preview: { type: "none" },
      animationIds: [],
    };
  }

  const rootAsset = await loadIndexedModelAsset(trimmedAssetName, modelAssetIndex, runtime);
  if (!rootAsset) {
    return {
      preview: { type: "none" },
      animationIds: [],
    };
  }

  const loadParentModelAsset = async (parentAssetName: string) =>
    await loadIndexedModelAsset(parentAssetName, modelAssetIndex, runtime);
  const [preview, animationIds] = await Promise.all([
    resolveModelPreviewFromModelAsset(
      rootAsset,
      runtime,
      loadParentModelAsset,
    ),
    resolveModelAnimationSetIdsFromModelAsset(rootAsset, loadParentModelAsset),
  ]);

  return {
    preview: preview.model ? preview : { type: "none" },
    animationIds,
  };
}

export async function resolveNpcAppearancePreview(
  assetName: string | undefined,
  runtime: AssetCacheRuntime,
  modelAssetIndex: RegisteredAssetsIndexShard | undefined,
): Promise<ModelPreviewState> {
  return (await resolveNpcAppearanceState(assetName, runtime, modelAssetIndex)).preview;
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
