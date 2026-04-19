import type {
  AssetEditorPreviewRequest,
} from "@shared/asset-editor/messageTypes";
import type { AssetPreviewType } from "@shared/fieldTypes";
import type { RootFieldInstance } from "../parsing/fieldInstances";

export type PreviewPointer = "Icon" | "Model" | "Texture";

export function isPreviewPointer(pointer: string): pointer is PreviewPointer {
  return pointer === "Icon" || pointer === "Model" || pointer === "Texture";
}

export function buildPreviewRequest(
  previewType: AssetPreviewType | undefined,
  assetTitle: string | undefined,
  rootField: RootFieldInstance | null,
  serializedDocument: Record<string, unknown> | null,
  overrides: Partial<Record<PreviewPointer, string | undefined>> = {},
): AssetEditorPreviewRequest | undefined {
  switch (previewType) {
    case "Item":
      return {
        type: "Item",
        iconPath: getEffectiveValue(rootField, "Icon", overrides),
      };
    case "Model": {
      const modelPath = getEffectiveValue(rootField, "Model", overrides);
      const texturePath =
        getEffectiveValue(rootField, "Texture", overrides) ??
        (modelPath?.toLowerCase().endsWith(".blockymodel")
          ? modelPath.replace(/\.blockymodel$/i, ".png")
          : undefined);

      if (assetTitle === "ModelAsset" && serializedDocument) {
        return {
          type: "Model",
          modelAsset: applyModelPreviewOverrides(serializedDocument, overrides),
        };
      }

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

function applyModelPreviewOverrides(
  serializedDocument: Record<string, unknown>,
  overrides: Partial<Record<PreviewPointer, string | undefined>>,
): Record<string, unknown> {
  const overriddenDocument = { ...serializedDocument };

  if ("Model" in overrides) {
    overriddenDocument.Model = overrides.Model ?? null;
  }

  if ("Texture" in overrides) {
    overriddenDocument.Texture = overrides.Texture ?? null;
  }

  return overriddenDocument;
}

/** ! Assumes top-level pointer */
function getEffectiveValue(
  rootField: RootFieldInstance | null,
  pointer: PreviewPointer,
  overrides: Partial<Record<PreviewPointer, string | undefined>>,
): string | undefined {
  if (pointer in overrides) {
    return overrides[pointer];
  }

  const field =
    rootField?.type === "object"
      ? rootField.properties[pointer]
      : rootField?.activeVariant?.properties[pointer];

  return field?.type === "string" ? (field.value ?? field.inheritedValue) : undefined;
}
