import type { ParameterUsageIndex } from "./compute/parameterUsageIndex";
import type { NpcPropertyField } from "./propertyModel";

export function resolveEffectiveAppearanceAssetName({
  appearanceField,
  parameterUsageIndex,
  standardParameterFields,
}: {
  appearanceField: NpcPropertyField | null;
  parameterUsageIndex: ParameterUsageIndex;
  standardParameterFields: NpcPropertyField[];
}): string | undefined {
  if (!appearanceField) {
    return undefined;
  }

  const literalAppearanceName = resolveLiteralStringFieldValue(appearanceField);
  if (literalAppearanceName) {
    return literalAppearanceName;
  }

  if (appearanceField.value.kind !== "compute") {
    return undefined;
  }

  const directTranslationParameterName =
    parameterUsageIndex.directTranslationByFieldPath.get(appearanceField.fieldPath);
  if (!directTranslationParameterName) {
    return undefined;
  }

  const parameterField =
    standardParameterFields.find(field => field.key === directTranslationParameterName) ?? null;
  return parameterField ? resolveLiteralStringFieldValue(parameterField) : undefined;
}

function resolveLiteralStringFieldValue(field: NpcPropertyField): string | undefined {
  if (field.value.kind !== "literal" || typeof field.value.value !== "string") {
    return undefined;
  }

  const trimmed = field.value.value.trim();
  return trimmed || undefined;
}
