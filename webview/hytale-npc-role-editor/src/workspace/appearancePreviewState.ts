import type {
  AnimationPreviewState,
  BaseModelPreviewState,
  ModelPreviewState,
} from "@shared/modelPreviewTypes";
import { createAppearanceAnimationPreviewCacheKey } from "../appearancePreviewRequests";
import type { Workspace } from "../workspace.svelte";

type CachedAnimationPreviewState = AnimationPreviewState | null;

export function resolveDesiredAppearanceAnimationSetId({
  assetName,
  autocompleteAnimationOverride,
  focusedAnimationOverride,
}: {
  assetName: string | null;
  autocompleteAnimationOverride: string | null;
  focusedAnimationOverride: string | null;
}): string | null {
  if (!assetName) {
    return null;
  }

  return autocompleteAnimationOverride ?? focusedAnimationOverride ?? "Idle";
}

export function beginWorkspaceAppearanceBasePreviewLoad(
  workspace: Workspace,
  assetName: string | null,
): void {
  if (!assetName) {
    clearWorkspaceAppearancePreviewState(workspace);
    return;
  }

  workspace.appearanceBasePreviewAssetName = assetName;
  workspace.appearanceBasePreview = undefined;
  workspace.appearanceBasePreviewLoading = true;
  workspace.appearanceAnimationIds = [];
  workspace.appearanceActiveAnimationAssetName = null;
  workspace.appearanceActiveAnimationSetId = null;
  workspace.appearanceActiveAnimationPreview = undefined;
  refreshWorkspaceAppearancePreview(workspace);
}

export function clearWorkspaceAppearancePreviewState(workspace: Workspace): void {
  workspace.appearanceBasePreviewAssetName = null;
  workspace.appearanceBasePreview = undefined;
  workspace.appearanceBasePreviewLoading = false;
  workspace.appearanceActiveAnimationAssetName = null;
  workspace.appearanceActiveAnimationSetId = null;
  workspace.appearanceActiveAnimationPreview = undefined;
  workspace.appearanceAnimationIds = [];
  workspace.appearanceAnimationPreviewCache = new Map();
  workspace.appearanceFocusedAnimationOverride = null;
  workspace.appearanceAutocompleteAnimationOverride = null;
  workspace.appearancePreview = undefined;
}

export function setWorkspaceAppearanceBasePreviewResult(
  workspace: Workspace,
  {
    assetName,
    basePreview,
    animationIds,
    idleAnimationPreview,
  }: {
    assetName: string | null;
    basePreview?: BaseModelPreviewState;
    animationIds: string[];
    idleAnimationPreview?: AnimationPreviewState;
  },
): void {
  workspace.appearanceBasePreviewAssetName = assetName;
  workspace.appearanceBasePreview = basePreview;
  workspace.appearanceBasePreviewLoading = false;
  workspace.appearanceAnimationIds = [...animationIds].sort((left, right) => left.localeCompare(right));

  if (assetName && idleAnimationPreview !== undefined) {
    workspace.appearanceAnimationPreviewCache.set(
      createAppearanceAnimationPreviewCacheKey(assetName, "Idle"),
      idleAnimationPreview,
    );
  }

  if (assetName) {
    const idlePreview = getWorkspaceAppearanceAnimationPreview(workspace, assetName, "Idle");
    workspace.appearanceActiveAnimationAssetName = assetName;
    workspace.appearanceActiveAnimationSetId = "Idle";
    workspace.appearanceActiveAnimationPreview = idlePreview;
  } else {
    workspace.appearanceActiveAnimationAssetName = null;
    workspace.appearanceActiveAnimationSetId = null;
    workspace.appearanceActiveAnimationPreview = undefined;
  }

  refreshWorkspaceAppearancePreview(workspace);
}

export function setWorkspaceAppearanceAnimationPreviewResult(
  workspace: Workspace,
  {
    assetName,
    animationSetId,
    animationPreview,
  }: {
    assetName: string;
    animationSetId: string;
    animationPreview?: AnimationPreviewState;
  },
): void {
  workspace.appearanceAnimationPreviewCache.set(
    createAppearanceAnimationPreviewCacheKey(assetName, animationSetId),
    animationPreview ?? null,
  );
}

export function showWorkspaceAppearanceAnimationPreview(
  workspace: Workspace,
  assetName: string,
  animationSetId: string,
): boolean {
  const cacheKey = createAppearanceAnimationPreviewCacheKey(assetName, animationSetId);
  if (!workspace.appearanceAnimationPreviewCache.has(cacheKey)) {
    return false;
  }

  const nextAnimationPreview =
    workspace.appearanceAnimationPreviewCache.get(cacheKey) ?? undefined;
  if (
    workspace.appearanceActiveAnimationAssetName === assetName &&
    workspace.appearanceActiveAnimationSetId === animationSetId &&
    workspace.appearanceActiveAnimationPreview === nextAnimationPreview
  ) {
    return true;
  }

  workspace.appearanceActiveAnimationAssetName = assetName;
  workspace.appearanceActiveAnimationSetId = animationSetId;
  workspace.appearanceActiveAnimationPreview = nextAnimationPreview;
  refreshWorkspaceAppearancePreview(workspace);
  return true;
}

export function getWorkspaceAppearanceAnimationPreview(
  workspace: Workspace,
  assetName: string,
  animationSetId: string,
): AnimationPreviewState | undefined {
  const cachedPreview = workspace.appearanceAnimationPreviewCache.get(
    createAppearanceAnimationPreviewCacheKey(assetName, animationSetId),
  );
  return cachedPreview ?? undefined;
}

function refreshWorkspaceAppearancePreview(workspace: Workspace): void {
  workspace.appearancePreview = composeWorkspaceAppearancePreview(
    workspace.appearanceBasePreview,
    workspace.appearanceActiveAnimationPreview,
    workspace.appearanceBasePreviewLoading,
  );
}

function composeWorkspaceAppearancePreview(
  basePreview: BaseModelPreviewState | undefined,
  animationPreview: AnimationPreviewState | undefined,
  loading: boolean,
): ModelPreviewState | undefined {
  if (basePreview?.model) {
    return animationPreview ? { ...basePreview, ...animationPreview } : basePreview;
  }

  if (loading) {
    return {
      type: "none",
      loading: true,
    };
  }

  return undefined;
}
