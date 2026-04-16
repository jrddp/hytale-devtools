import type { AssetCacheRuntime } from "../asset-cache/assetCacheRuntime";
import type { RegisteredAssetsIndexShard } from "../shared/indexTypes";
import {
  resolveModelPreviewFromPaths,
  resolveTexturePathWithModelFallback,
} from "../shared/modelPreviewResolution";
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

  const visitedAssetNames = new Set<string>();
  let currentAssetName: string | undefined = trimmedAssetName;
  let modelPath: string | undefined;
  let texturePath: string | undefined;

  while (currentAssetName) {
    if (visitedAssetNames.has(currentAssetName)) {
      return { type: "none" };
    }
    visitedAssetNames.add(currentAssetName);

    const metadata = modelAssetIndex.values[currentAssetName];
    if (!metadata?.sourcedFromFile) {
      return { type: "none" };
    }

    const asset = await runtime.loadAssetByPath(metadata.sourcedFromFile);
    if (asset?.contentType !== "json" || !isRecord(asset.rawJson)) {
      return { type: "none" };
    }

    if (!texturePath) {
      texturePath = toNonEmptyString(asset.rawJson.Texture);
    }

    const nextModelPath = toNonEmptyString(asset.rawJson.Model);
    if (nextModelPath) {
      modelPath = nextModelPath;
      break;
    }

    currentAssetName = toNonEmptyString(asset.rawJson.Parent);
  }

  if (!modelPath) {
    return { type: "none" };
  }

  const preview = await resolveModelPreviewFromPaths(
    modelPath,
    resolveTexturePathWithModelFallback(texturePath, modelPath),
    runtime,
  );
  return preview.model ? preview : { type: "none" };
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
