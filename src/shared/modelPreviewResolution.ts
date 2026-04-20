import type { AssetCacheRuntime } from "../asset-cache/assetCacheRuntime";
import { stripBomText } from "./fileUtils";
import type {
  AnimationPreviewState,
  ResolvedModelPreview,
  ResolvedModelPreviewAttachment,
} from "./modelPreviewTypes";

export type ModelAssetDocument = Record<string, unknown>;
type ModelAttachmentReference = {
  Model: string;
  Texture?: string;
};

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

export async function resolveModelPreviewFromModelAsset(
  modelAsset: ModelAssetDocument,
  runtime: AssetCacheRuntime,
  loadParentModelAsset: (assetName: string) => Promise<ModelAssetDocument | undefined>,
  defaultAnimationSetId = "Idle",
): Promise<ResolvedModelPreview> {
  const assetChain = await collectModelAssetChain(modelAsset, loadParentModelAsset);
  const modelPath = findNearestStringValue(assetChain, "Model");
  const texturePath = findNearestStringValue(assetChain, "Texture");
  const [preview, attachments, resolvedAnimation] = await Promise.all([
    resolveModelPreviewFromPaths(
      modelPath,
      resolveTexturePathWithModelFallback(texturePath, modelPath),
      runtime,
    ),
    resolveDefaultAttachmentPreviews(assetChain, runtime),
    resolveDefaultAnimationPreview(
      assetChain,
      defaultAnimationSetId,
      runtime,
    ),
  ]);

  const attachmentMetadata = attachments.length > 0 ? { attachments } : undefined;
  const previewWithAttachments = attachmentMetadata ? { ...preview, ...attachmentMetadata } : preview;
  return resolvedAnimation
    ? { ...previewWithAttachments, ...resolvedAnimation }
    : previewWithAttachments;
}

export async function resolveModelAnimationSetIdsFromModelAsset(
  modelAsset: ModelAssetDocument,
  loadParentModelAsset: (assetName: string) => Promise<ModelAssetDocument | undefined>,
): Promise<string[]> {
  const assetChain = await collectModelAssetChain(modelAsset, loadParentModelAsset);
  return resolveMergedAnimationSetIds(assetChain);
}

export async function resolveModelAnimationPreviewFromModelAsset(
  modelAsset: ModelAssetDocument,
  loadParentModelAsset: (assetName: string) => Promise<ModelAssetDocument | undefined>,
  animationSetId: string,
  runtime: AssetCacheRuntime,
): Promise<AnimationPreviewState | undefined> {
  const assetChain = await collectModelAssetChain(modelAsset, loadParentModelAsset);
  return await resolveDefaultAnimationPreview(assetChain, animationSetId, runtime);
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

async function collectModelAssetChain(
  rootAsset: ModelAssetDocument,
  loadParentModelAsset: (assetName: string) => Promise<ModelAssetDocument | undefined>,
): Promise<ModelAssetDocument[]> {
  const chain = [rootAsset];
  const visitedParentNames = new Set<string>();
  let currentAsset = rootAsset;

  while (true) {
    const parentName = toNonEmptyString(currentAsset.Parent);
    if (!parentName || visitedParentNames.has(parentName)) {
      return chain;
    }

    visitedParentNames.add(parentName);
    const parentAsset = await loadParentModelAsset(parentName);
    if (!parentAsset) {
      return chain;
    }

    chain.push(parentAsset);
    currentAsset = parentAsset;
  }
}

function findNearestStringValue(
  assetChain: ModelAssetDocument[],
  key: string,
): string | undefined {
  for (const asset of assetChain) {
    const value = toNonEmptyString(asset[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

async function resolveDefaultAttachmentPreviews(
  assetChain: ModelAssetDocument[],
  runtime: AssetCacheRuntime,
): Promise<ResolvedModelPreviewAttachment[]> {
  const attachmentReferences = findNearestDefaultAttachments(assetChain);
  if (!attachmentReferences?.length) {
    return [];
  }

  const resolvedAttachments = await Promise.all(
    attachmentReferences.map(async attachment => {
      const preview = await resolveModelPreviewFromPaths(
        attachment.Model,
        resolveTexturePathWithModelFallback(attachment.Texture, attachment.Model),
        runtime,
      );

      return preview.model
        ? {
            model: preview.model,
            texture: preview.texture,
          }
        : undefined;
    }),
  );

  const attachments: ResolvedModelPreviewAttachment[] = [];
  for (const attachment of resolvedAttachments) {
    if (attachment) {
      attachments.push(attachment);
    }
  }

  return attachments;
}

function findNearestDefaultAttachments(
  assetChain: ModelAssetDocument[],
): ModelAttachmentReference[] | undefined {
  for (const asset of assetChain) {
    if (!Array.isArray(asset.DefaultAttachments)) {
      continue;
    }

    const attachments = asset.DefaultAttachments
      .map(parseModelAttachmentReference)
      .filter((attachment): attachment is ModelAttachmentReference => attachment !== undefined);

    return attachments;
  }

  return undefined;
}

function parseModelAttachmentReference(value: unknown): ModelAttachmentReference | undefined {
  const record = asRecord(value);
  const modelPath = toNonEmptyString(record?.Model);
  if (!modelPath) {
    return undefined;
  }

  const texturePath = toNonEmptyString(record?.Texture);
  return texturePath ? { Model: modelPath, Texture: texturePath } : { Model: modelPath };
}

async function resolveDefaultAnimationPreview(
  assetChain: ModelAssetDocument[],
  animationSetId: string,
  runtime: AssetCacheRuntime,
): Promise<AnimationPreviewState | undefined> {
  const animationEntry = resolveMergedAnimationEntry(assetChain, animationSetId);
  if (!animationEntry) {
    return undefined;
  }

  const animation = await loadJsonAssetBytes(animationEntry.animationPath, runtime);
  if (!animation) {
    return undefined;
  }

  return {
    animation,
    animationSpeed: animationEntry.speed,
    animationLooping: animationEntry.looping,
  };
}

function resolveMergedAnimationEntry(
  assetChain: ModelAssetDocument[],
  animationSetId: string,
): {
  animationPath: string;
  speed?: number;
  looping?: boolean;
} | undefined {
  const mergedAnimationSets: Record<string, unknown> = {};

  for (const asset of [...assetChain].reverse()) {
    const animationSets = asRecord(asset.AnimationSets);
    if (!animationSets) {
      continue;
    }

    Object.assign(mergedAnimationSets, animationSets);
  }

  const animationSet = asRecord(mergedAnimationSets[animationSetId]);
  if (!animationSet) {
    return undefined;
  }

  const firstAnimation = Array.isArray(animationSet.Animations)
    ? animationSet.Animations[0]
    : undefined;
  const animationConfig = asRecord(firstAnimation);
  const animationPath = toNonEmptyString(animationConfig?.Animation);
  if (!animationPath) {
    return undefined;
  }

  return {
    animationPath,
    speed: toFiniteNumber(animationConfig?.Speed),
    looping: typeof animationConfig?.Looping === "boolean" ? animationConfig.Looping : undefined,
  };
}

function resolveMergedAnimationSetIds(assetChain: ModelAssetDocument[]): string[] {
  const mergedAnimationSets: Record<string, unknown> = {};

  for (const asset of [...assetChain].reverse()) {
    const animationSets = asRecord(asset.AnimationSets);
    if (!animationSets) {
      continue;
    }

    Object.assign(mergedAnimationSets, animationSets);
  }

  return Object.keys(mergedAnimationSets).sort((left, right) => left.localeCompare(right));
}

async function loadJsonAssetBytes(
  assetPath: string,
  runtime: AssetCacheRuntime,
): Promise<Record<string, unknown> | undefined> {
  const bytes = await runtime.readAssetBytesByPath(assetPath);
  if (!bytes) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(stripBomText(bytes.toString("utf8")));
    return asRecord(parsed);
  } catch {
    return undefined;
  }
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
