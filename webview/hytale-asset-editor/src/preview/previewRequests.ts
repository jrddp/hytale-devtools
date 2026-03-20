import type {
  AssetEditorPreviewRequest,
} from "@shared/asset-editor/messageTypes";
import type { AssetPreviewType } from "@shared/fieldTypes";
import type { RootFieldInstance } from "../parsing/fieldInstances";

export function isPreviewPointer(pointer: string): boolean {
  return pointer === "Icon" || pointer === "Model" || pointer === "Texture";
}

export function buildPreviewRequest(
  previewType: AssetPreviewType | undefined,
  rootField: RootFieldInstance | null,
): AssetEditorPreviewRequest | undefined {
  switch (previewType) {
    case "Item":
      return {
        type: "Item",
        iconPath: getEffectiveRootStringFieldValue(rootField, "Icon"),
      };
    case "Model": {
      const modelPath = getEffectiveRootStringFieldValue(rootField, "Model");
      const texturePath =
        getEffectiveRootStringFieldValue(rootField, "Texture") ??
        (modelPath?.toLowerCase().endsWith(".blockymodel")
          ? modelPath.replace(/\.blockymodel$/i, ".png")
          : undefined);

      return {
        type: "Model",
        modelPath,
        texturePath,
      };
    }
    default:
      return undefined;
  }
}

function getEffectiveRootStringFieldValue(
  rootField: RootFieldInstance | null,
  pointer: "Icon" | "Model" | "Texture",
): string | undefined {
  const field =
    rootField?.type === "object"
      ? rootField.properties[pointer]
      : rootField?.activeVariant?.properties[pointer];

  return field?.type === "string" ? (field.value ?? field.inheritedValue) : undefined;
}
