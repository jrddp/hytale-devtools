import type { ModelPreviewState } from "@shared/modelPreviewTypes";
import type { NpcRoleEditorWebviewToExtensionMessage } from "@shared/npc-role-editor/messageTypes";
import type { VSCodeApi } from "./common";

export type AppearancePreviewRequestState = {
  assetName: string | null;
  animationSetId: string | null;
};

export function isAppearancePreviewUpdateCurrent({
  assetName,
  animationSetId,
  currentRequest,
}: {
  assetName: string | undefined;
  animationSetId: string | undefined;
  currentRequest: AppearancePreviewRequestState | null;
}): boolean {
  return (
    (assetName ?? null) === (currentRequest?.assetName ?? null) &&
    (animationSetId ?? null) === (currentRequest?.animationSetId ?? null)
  );
}

export function syncAppearancePreviewRequest({
  assetName,
  animationSetId,
  lastRequestedRequest,
  vscode,
  setPreview,
}: {
  assetName: string | null;
  animationSetId: string | null;
  lastRequestedRequest: AppearancePreviewRequestState | null;
  vscode: Pick<VSCodeApi, "postMessage">;
  setPreview: (preview: ModelPreviewState | undefined) => void;
}): AppearancePreviewRequestState | null {
  if (
    assetName === lastRequestedRequest?.assetName &&
    animationSetId === lastRequestedRequest?.animationSetId
  ) {
    return lastRequestedRequest;
  }

  if (!assetName) {
    setPreview({ type: "none" });
    return null;
  }

  setPreview({ type: "none", loading: true });
  vscode.postMessage({
    type: "resolveAppearancePreview",
    assetName,
    animationSetId: animationSetId ?? undefined,
  } satisfies NpcRoleEditorWebviewToExtensionMessage);
  return {
    assetName,
    animationSetId,
  };
}
