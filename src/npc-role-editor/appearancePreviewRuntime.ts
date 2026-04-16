import type { AssetCacheRuntime } from "../asset-cache/assetCacheRuntime";
import type { RegisteredAssetsIndexShard } from "../shared/indexTypes";
import { resolveModelPreviewFromModelAsset } from "../shared/modelPreviewResolution";
import type { ModelPreviewState } from "../shared/modelPreviewTypes";

export async function resolveNpcAppearancePreview(
  assetName: string | undefined,
  runtime: AssetCacheRuntime,
  modelAssetIndex: RegisteredAssetsIndexShard | undefined,
): Promise<ModelPreviewState> {
  const trimmedAssetName = assetName?.trim();
  if (!trimmedAssetName || !modelAssetIndex) {
    return { type: "none" };
  }

  const rootAsset = await loadIndexedModelAsset(trimmedAssetName, modelAssetIndex, runtime);
  if (!rootAsset) {
    return { type: "none" };
  }

  const preview = await resolveModelPreviewFromModelAsset(
    rootAsset,
    runtime,
    async parentAssetName => await loadIndexedModelAsset(parentAssetName, modelAssetIndex, runtime),
  );
  return preview.model ? preview : { type: "none" };
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
