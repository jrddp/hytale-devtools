import type {
  NpcDescriptor,
  NpcDescriptorAttribute,
  NpcDescriptorDocument,
} from "@shared/npc-role-editor/descriptorTypes";
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
  humanize,
  normalizeTypeHint,
  toOptionalDisplayString,
} from "./propertyFieldUtilities";
import {
  inferPrimitiveNpcFieldShapeFromDescriptor,
  inferPrimitiveNpcLiteralFieldShape,
  parseNpcDescriptorDefaultValue,
  parseNpcDescriptorStaticSuggestions,
  resolveNpcDescriptorFieldSymbolRef,
} from "./descriptorFieldSupport";

const EFFECTIVELY_OPTIONAL_ROLE_ATTRIBUTES = new Set(["BusyStates"]);

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
    required: isEffectivelyRequiredRoleAttribute(key, descriptorAttribute),
    isSet,
    computable: descriptorAttribute?.Computable === true,
    canRename: false,
    canChangeType: false,
    canUnset: isSet,
    isDescriptionEditable: false,
    itemType: parsedShape.itemType,
    stateAutocompleteKind: resolveRoleAttributeStateAutocompleteKind(key),
    staticSuggestions: parseNpcDescriptorStaticSuggestions(descriptorAttribute),
    symbolRef: resolveNpcDescriptorFieldSymbolRef(descriptorAttribute),
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
      isEffectivelyRequiredRoleAttribute(descriptorAttribute.Name, descriptorAttribute) ||
      includedKeySet.has(descriptorAttribute.Name) ||
      !isNpcRoleAttributeKey(descriptorAttribute.Name)
    ) {
      return [];
    }

    const parameterDefinition = isParameterDefinitionJson(parameters?.[descriptorAttribute.Name])
      ? (parameters?.[descriptorAttribute.Name] as NpcParameterDefinitionJson)
      : undefined;
    const defaultValue = parseNpcDescriptorDefaultValue(descriptorAttribute);

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

  return inferPrimitiveNpcLiteralFieldShape(value);
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

  return inferPrimitiveNpcLiteralFieldShape(
    definition.Value,
    normalizeTypeHint(definition.TypeHint),
  );
}

function inferFieldShapeFromDescriptor(
  descriptorAttribute?: NpcDescriptorAttribute,
  parameterDefinition?: NpcParameterDefinitionJson,
): Pick<NpcPropertyField, "kind" | "value" | "itemType"> {
  const fallbackShape = inferPrimitiveNpcFieldShapeFromDescriptor(descriptorAttribute);
  if (fallbackShape.kind !== "rawJson" || !parameterDefinition) {
    return fallbackShape;
  }

  return parseParameterFieldShape(parameterDefinition);
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

export function isEffectivelyRequiredRoleAttribute(
  key: string,
  descriptorAttribute?: NpcDescriptorAttribute,
): boolean {
  return (
    descriptorAttribute?.Required === "REQUIRED" &&
    !EFFECTIVELY_OPTIONAL_ROLE_ATTRIBUTES.has(key)
  );
}

function isParameterDefinitionJson(value: unknown): value is NpcParameterDefinitionJson {
  return isRecord(value) && "Value" in value;
}
