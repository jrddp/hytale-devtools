import type { NpcRoleEditorWebviewToExtensionMessage } from "@shared/npc-role-editor/messageTypes";
import type { VSCodeApi } from "./common";

export type AppearancePreviewAnimationRequestState = {
  assetName: string;
  animationSetId: string;
};

export function createAppearanceAnimationPreviewCacheKey(
  assetName: string,
  animationSetId: string,
): string {
  return `${assetName}::${animationSetId}`;
}

export function isAppearancePreviewBaseUpdateCurrent({
  assetName,
  currentAssetName,
}: {
  assetName: string | undefined;
  currentAssetName: string | null;
}): boolean {
  return (assetName ?? null) === currentAssetName;
}

export function isAppearancePreviewAnimationUpdateCurrent({
  assetName,
  animationSetId,
  currentAssetName,
  currentAnimationSetId,
}: {
  assetName: string;
  animationSetId: string;
  currentAssetName: string | null;
  currentAnimationSetId: string | null;
}): boolean {
  return assetName === currentAssetName && animationSetId === currentAnimationSetId;
}

export function requestAppearancePreviewBase(
  vscode: Pick<VSCodeApi, "postMessage">,
  assetName: string | null,
): void {
  vscode.postMessage({
    type: "resolveAppearancePreviewBase",
    assetName: assetName ?? undefined,
  } satisfies NpcRoleEditorWebviewToExtensionMessage);
}

export function syncAppearancePreviewAnimationRequest({
  assetName,
  animationSetId,
  lastRequestedRequest,
  vscode,
}: {
  assetName: string;
  animationSetId: string;
  lastRequestedRequest: AppearancePreviewAnimationRequestState | null;
  vscode: Pick<VSCodeApi, "postMessage">;
}): AppearancePreviewAnimationRequestState {
  if (
    lastRequestedRequest?.assetName === assetName &&
    lastRequestedRequest.animationSetId === animationSetId
  ) {
    return lastRequestedRequest;
  }

  vscode.postMessage({
    type: "resolveAppearancePreviewAnimation",
    assetName,
    animationSetId,
  } satisfies NpcRoleEditorWebviewToExtensionMessage);

  return {
    assetName,
    animationSetId,
  };
}
