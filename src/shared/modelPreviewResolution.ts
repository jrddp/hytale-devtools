import type { AssetCacheRuntime } from "../asset-cache/assetCacheRuntime";
import type { ResolvedModelPreview } from "./modelPreviewTypes";

export async function resolveModelPreviewFromPaths(
  modelPath: string | undefined,
  texturePath: string | undefined,
  runtime: AssetCacheRuntime,
): Promise<ResolvedModelPreview> {
  const [modelAsset, textureBytes] = await Promise.all([
    modelPath ? runtime.loadAssetByPath(modelPath) : undefined,
    texturePath ? runtime.readAssetBytesByPath(texturePath) : undefined,
  ]);

  return {
    type: "Model",
    model: modelAsset?.contentType === "json" ? modelAsset.rawJson : undefined,
    texture: textureBytes ? Array.from(textureBytes) : undefined,
  };
}

// The base game falls back to the same path as the model, but with .png instead of .blockymodel.
export function resolveTexturePathWithModelFallback(
  texturePath: string | undefined,
  modelPath: string | undefined,
): string | undefined {
  return (
    texturePath ??
    (modelPath?.toLowerCase().endsWith(".blockymodel")
      ? modelPath.replace(/\.blockymodel$/i, ".png")
      : undefined)
  );
}
