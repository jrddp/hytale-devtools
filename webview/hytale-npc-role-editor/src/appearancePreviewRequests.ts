import type { ModelPreviewState } from "@shared/modelPreviewTypes";
import type { NpcRoleEditorWebviewToExtensionMessage } from "@shared/npc-role-editor/messageTypes";
import type { VSCodeApi } from "./common";

export function syncAppearancePreviewRequest({
  assetName,
  lastRequestedAssetName,
  vscode,
  setPreview,
}: {
  assetName: string | null;
  lastRequestedAssetName: string | null;
  vscode: Pick<VSCodeApi, "postMessage">;
  setPreview: (preview: ModelPreviewState | undefined) => void;
}): string | null {
  if (assetName === lastRequestedAssetName) {
    return lastRequestedAssetName;
  }

  if (!assetName) {
    setPreview({ type: "none" });
    return null;
  }

  setPreview({ type: "none", loading: true });
  vscode.postMessage({
    type: "resolveAppearancePreview",
    assetName,
  } satisfies NpcRoleEditorWebviewToExtensionMessage);
  return assetName;
}
