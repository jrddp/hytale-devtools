import type {
  NpcDescriptor,
  NpcDescriptorAttribute,
  NpcDescriptorDocument,
} from "@shared/npc-role-editor/descriptorTypes";
import { resolveNpcDescriptorAssetSymbolLookup } from "@shared/npc-role-editor/assetSymbolLookup";
import type { IndexReference } from "@shared/indexTypes";
import type { NpcStateAutocompleteKind } from "@shared/npc-role-editor/stateAutocomplete";
import type { NpcPropertyField } from "./propertyTypes";
import type {
  NpcParameterDefinitionJson,
  NpcParametersJson,
  NpcRoleType,
} from "./parsing/documentTypes";
import { isNpcComputeJson, isRecord } from "./parsing/documentTypes";
import { isNpcRoleAttributeKey } from "./roleAttributes";
import {
  cloneJsonLike,
  humanize,
  inferItemTypeFromPrimitiveList,
  isPrimitiveListItem,
  normalizeFlagValue,
  normalizeTypeHint,
  toOptionalDisplayString,
} from "./propertyFieldUtilities";

export function resolveRoleDescriptor(
  roleType: NpcRoleType,
  descriptors: NpcDescriptorDocument,
): NpcDescriptor | undefined {
  const descriptorName = roleType === "Abstract" ? "Generic" : roleType;
  return descriptors.find(
    descriptor => descriptor.Category === "Role" && descriptor.Name === descriptorName,
  );
}

export function createRoleAttributeField({
  key,
  value,
  descriptorAttribute,
  parameterDefinition,
  isSet,
}: {
  key: string;
  value: unknown;
  descriptorAttribute?: NpcDescriptorAttribute;
  parameterDefinition?: NpcParameterDefinitionJson;
  isSet: boolean;
}): NpcPropertyField {
  const parsedShape =
    value === undefined
      ? inferFieldShapeFromDescriptor(descriptorAttribute, parameterDefinition)
      : parseRoleAttributeFieldShape(value, descriptorAttribute, parameterDefinition);

  return {
    id: `role-attribute-${key}`,
    key,
    label: humanize(key) ?? key,
    fieldPath: key,
    kind: parsedShape.kind,
    value: parsedShape.value,
    description:
      toOptionalDisplayString(descriptorAttribute?.ShortDescription) ??
      toOptionalDisplayString(descriptorAttribute?.LongDescription),
    required: descriptorAttribute?.Required === "REQUIRED",
    isSet,
    computable: descriptorAttribute?.Computable === true,
    canRename: false,
    canChangeType: false,
    canUnset: isSet,
    isDescriptionEditable: false,
    itemType: parsedShape.itemType,
    stateAutocompleteKind: resolveRoleAttributeStateAutocompleteKind(key),
    staticSuggestions: parseStaticSuggestions(descriptorAttribute),
    symbolRef: resolveFieldSymbolRef(descriptorAttribute),
    ui: {},
  };
}

export function getAvailableRoleAttributeFields({
  roleType,
  descriptors,
  parameters,
  includedKeys,
}: {
  roleType: NpcRoleType | null;
  descriptors: NpcDescriptorDocument;
  parameters?: NpcParametersJson;
  includedKeys: Iterable<string>;
}): NpcPropertyField[] {
  if (roleType !== "Generic" && roleType !== "Abstract") {
    return [];
  }

  const includedKeySet = new Set(includedKeys);
  const roleDescriptor = resolveRoleDescriptor(roleType, descriptors);

  return (roleDescriptor?.Attributes ?? []).flatMap(descriptorAttribute => {
    if (
      descriptorAttribute.Required === "REQUIRED" ||
      includedKeySet.has(descriptorAttribute.Name) ||
      !isNpcRoleAttributeKey(descriptorAttribute.Name)
    ) {
      return [];
    }

    const parameterDefinition = isParameterDefinitionJson(parameters?.[descriptorAttribute.Name])
      ? (parameters?.[descriptorAttribute.Name] as NpcParameterDefinitionJson)
      : undefined;
    const defaultValue = parseDescriptorDefaultValue(descriptorAttribute);

    return [
      createRoleAttributeField({
        key: descriptorAttribute.Name,
        value: defaultValue,
        descriptorAttribute,
        parameterDefinition,
        isSet: true,
      }),
    ];
  });
}

function parseRoleAttributeFieldShape(
  value: unknown,
  descriptorAttribute?: NpcDescriptorAttribute,
  parameterDefinition?: NpcParameterDefinitionJson,
): Pick<NpcPropertyField, "kind" | "value" | "itemType"> {
  if (isNpcComputeJson(value)) {
    const fallbackShape = inferFieldShapeFromDescriptor(descriptorAttribute, parameterDefinition);
    return {
      kind: fallbackShape.kind,
      value: {
        kind: "compute",
        expression: value.Compute,
      },
      itemType: fallbackShape.itemType,
    };
  }

  return inferLiteralFieldShape(value);
}

function parseParameterFieldShape(
  definition: NpcParameterDefinitionJson,
): Pick<NpcPropertyField, "kind" | "value" | "itemType"> {
  if (isNpcComputeJson(definition.Value)) {
    return {
      kind: "string",
      value: {
        kind: "compute",
        expression: definition.Value.Compute,
      },
    };
  }

  return inferLiteralFieldShape(definition.Value, normalizeTypeHint(definition.TypeHint));
}

function inferFieldShapeFromDescriptor(
  descriptorAttribute?: NpcDescriptorAttribute,
  parameterDefinition?: NpcParameterDefinitionJson,
): Pick<NpcPropertyField, "kind" | "value" | "itemType"> {
  const descriptorType = descriptorAttribute?.Type;
  const normalizedDomain = normalizeTypeHint(descriptorAttribute?.Domain);

  switch (descriptorType) {
    case "Boolean":
      return {
        kind: "boolean",
        value: { kind: "literal", value: false },
      };
    case "Integer":
    case "Double":
      return {
        kind: "number",
        value: { kind: "literal", value: 0 },
      };
    case "AssetArray":
      return {
        kind: "list",
        value: { kind: "literal", value: [] },
        itemType: "string",
      };
    case "Array":
      return {
        kind: "list",
        value: { kind: "literal", value: [] },
        itemType: normalizedDomain ?? "string",
      };
    case "Asset":
    case "Enum":
    case "Flag":
    case "String":
      return {
        kind: "string",
        value: { kind: "literal", value: "" },
      };
    default:
      if (parameterDefinition) {
        return parseParameterFieldShape(parameterDefinition);
      }

      return {
        kind: "rawJson",
        value: { kind: "literal", value: {} },
      };
  }
}

function inferLiteralFieldShape(
  value: unknown,
  fallbackItemType?: "string" | "number" | "boolean",
): Pick<NpcPropertyField, "kind" | "value" | "itemType"> {
  if (typeof value === "boolean") {
    return {
      kind: "boolean",
      value: { kind: "literal", value },
    };
  }

  if (typeof value === "number") {
    return {
      kind: "number",
      value: { kind: "literal", value },
    };
  }

  if (typeof value === "string") {
    return {
      kind: "string",
      value: { kind: "literal", value },
    };
  }

  if (Array.isArray(value) && value.every(isPrimitiveListItem)) {
    return {
      kind: "list",
      value: { kind: "literal", value: cloneJsonLike(value) },
      itemType: inferItemTypeFromPrimitiveList(value) ?? fallbackItemType ?? "string",
    };
  }

  if (Array.isArray(value) && value.length === 0) {
    return {
      kind: "list",
      value: { kind: "literal", value: [] },
      itemType: fallbackItemType ?? "string",
    };
  }

  return {
    kind: "rawJson",
    value: { kind: "literal", value: cloneJsonLike(value) },
  };
}

function parseDescriptorDefaultValue(attribute: NpcDescriptorAttribute): unknown {
  const defaultValue = attribute.DefaultValue;
  if (typeof defaultValue !== "string" || !defaultValue.trim()) {
    return undefined;
  }

  switch (attribute.Type) {
    case "Boolean":
      return defaultValue === "true";
    case "Integer":
    case "Double": {
      const nextValue = Number(defaultValue);
      return Number.isFinite(nextValue) ? nextValue : undefined;
    }
    case "Asset":
    case "Enum":
    case "Flag":
    case "String":
      return defaultValue;
    case "Array":
    case "AssetArray":
      try {
        const parsed = JSON.parse(defaultValue);
        return Array.isArray(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    default:
      return undefined;
  }
}

function resolveFieldSymbolRef(
  descriptorAttribute?: NpcDescriptorAttribute,
): IndexReference | undefined {
  return resolveNpcDescriptorAssetSymbolLookup(descriptorAttribute);
}

function resolveRoleAttributeStateAutocompleteKind(
  key: string,
): NpcStateAutocompleteKind | undefined {
  switch (key) {
    case "StartState":
      return "role-main";
    case "BusyStates":
      return "role-full";
    default:
      return undefined;
  }
}

function parseStaticSuggestions(
  descriptorAttribute?: NpcDescriptorAttribute,
): string[] | undefined {
  const rawFlagDescriptions = descriptorAttribute?.FlagDescriptions;
  if (!isRecord(rawFlagDescriptions)) {
    return undefined;
  }

  const values = Object.keys(rawFlagDescriptions).map(normalizeFlagValue);
  return values.length > 0 ? values : undefined;
}

function isParameterDefinitionJson(value: unknown): value is NpcParameterDefinitionJson {
  return isRecord(value) && "Value" in value;
}
