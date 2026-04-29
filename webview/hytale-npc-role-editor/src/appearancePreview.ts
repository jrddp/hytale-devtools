import type { NpcParameterValueJson, NpcRoleType } from "./parsing/documentTypes";
import { isNpcComputeJson } from "./parsing/documentTypes";
import {
  extractDirectTranslationIdentifier,
  type ParameterUsageIndex,
} from "./compute/parameterUsageIndex";
import type { NpcPropertyField } from "./propertyModel";

export function resolveEffectiveAppearanceAssetName({
  roleType,
  appearanceField,
  variantAppearanceField,
  parameterUsageIndex,
  standardParameterFields,
  inheritedAppearanceValue,
  inheritedEffectiveParameters,
}: {
  roleType: NpcRoleType | null;
  appearanceField: NpcPropertyField | null;
  variantAppearanceField: NpcPropertyField | null;
  parameterUsageIndex: ParameterUsageIndex;
  standardParameterFields: NpcPropertyField[];
  inheritedAppearanceValue?: NpcParameterValueJson;
  inheritedEffectiveParameters?: Record<string, NpcParameterValueJson>;
}): string | undefined {
  const resolveParameterValueByName = createParameterValueResolver({
    standardParameterFields,
    inheritedEffectiveParameters,
  });

  if (roleType === "Variant") {
    if (variantAppearanceField && variantAppearanceField.isSet !== false) {
      return resolveAppearanceFieldValue(variantAppearanceField, parameterUsageIndex, resolveParameterValueByName);
    }

    return resolveAppearanceParameterValue(inheritedAppearanceValue, resolveParameterValueByName);
  }

  return resolveAppearanceFieldValue(appearanceField, parameterUsageIndex, resolveParameterValueByName);
}

function createParameterValueResolver({
  standardParameterFields,
  inheritedEffectiveParameters,
}: {
  standardParameterFields: NpcPropertyField[];
  inheritedEffectiveParameters?: Record<string, NpcParameterValueJson>;
}): (parameterName: string) => string | undefined {
  const localParameterFieldsByName = new Map(
    standardParameterFields.map(field => [field.key, field] as const),
  );

  return (parameterName: string) => {
    const localField = localParameterFieldsByName.get(parameterName);
    if (localField) {
      return resolveLiteralStringFieldValue(localField);
    }

    return resolveLiteralStringParameterValue(inheritedEffectiveParameters?.[parameterName]);
  };
}

function resolveAppearanceFieldValue(
  appearanceField: NpcPropertyField | null,
  parameterUsageIndex: ParameterUsageIndex,
  resolveParameterValueByName: (parameterName: string) => string | undefined,
): string | undefined {
  if (!appearanceField || appearanceField.isSet === false) {
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

  return resolveParameterValueByName(directTranslationParameterName);
}

function resolveAppearanceParameterValue(
  appearanceValue: NpcParameterValueJson | undefined,
  resolveParameterValueByName: (parameterName: string) => string | undefined,
): string | undefined {
  if (typeof appearanceValue === "string") {
    const trimmedValue = appearanceValue.trim();
    return trimmedValue || undefined;
  }

  if (!isNpcComputeJson(appearanceValue)) {
    return undefined;
  }

  const directTranslationParameterName = extractDirectTranslationIdentifier(appearanceValue.Compute);
  if (!directTranslationParameterName) {
    return undefined;
  }

  return resolveParameterValueByName(directTranslationParameterName);
}

function resolveLiteralStringFieldValue(field: NpcPropertyField): string | undefined {
  if (field.value.kind !== "literal" || typeof field.value.value !== "string") {
    return undefined;
  }

  const trimmed = field.value.value.trim();
  return trimmed || undefined;
}

function resolveLiteralStringParameterValue(value: NpcParameterValueJson | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}
