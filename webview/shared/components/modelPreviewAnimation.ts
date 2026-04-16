import type { ModelPreviewState } from "@shared/modelPreviewTypes";
import { parseBlockyanimFile, type BlockyAnimFile } from "../blockymodel";

export function resolveParsedPreviewAnimation(
  preview: ModelPreviewState | undefined,
): BlockyAnimFile | undefined {
  if (preview?.type !== "Model" || !preview.animation) {
    return undefined;
  }

  try {
    return parseBlockyanimFile(preview.animation);
  } catch {
    return undefined;
  }
}
