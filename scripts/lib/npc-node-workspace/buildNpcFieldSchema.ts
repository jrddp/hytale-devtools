import type {
  NpcDescriptor,
  NpcDescriptorAttribute,
} from "../../../src/shared/npc-role-editor/descriptorTypes";
import type { NpcAnimationAutocompleteKind } from "../../../src/shared/npc-role-editor/animationAutocomplete";
import { resolveNpcDescriptorAssetSymbolLookup } from "../../../src/shared/npc-role-editor/assetSymbolLookup";
import type { NpcStateAutocompleteKind } from "../../../src/shared/npc-role-editor/stateAutocomplete";
import { getNpcBehaviorChildDomain } from "../../../src/shared/node-editor/npcBehaviorWorkspaceSemantics";
import type { NodeContentDefinition } from "../../../src/node-editor/workspaceDefinitionTypes";
import { normalizeDescription } from "./npcNodeWorkspaceModel";

export function buildContentField(
  descriptor: Pick<NpcDescriptor, "Category" | "Name">,
  attribute: NpcDescriptorAttribute,
): NodeContentDefinition | null {
  if (attribute.Type === "Parameters") {
    return null;
  }

  const enumValues = parseEnumValues(attribute.Domain);
  const type = resolveFieldType(attribute, enumValues);
  if (!type) {
    return null;
  }

  const options: NodeContentDefinition["Options"] = {
    Label: attribute.Name,
  };
  applyValidationOptions(attribute, type, options);
  const defaultValue = parseDefaultValue(attribute);
  if (defaultValue !== undefined) {
    options.Default = defaultValue;
  }
  const inputWidth = getInputWidth(type);
  if (inputWidth !== undefined) {
    options.Width = inputWidth;
  }
  if (type === "Tuple") {
    options.TupleSize = attribute.MinSize ?? undefined;
    options.TupleItemType = resolveTupleItemType(attribute);
  }
  if (type === "List") {
    options.Type = resolveListItemType(attribute);
  }
  if (shouldUseUniqueItems(attribute)) {
    options.UniqueItems = true;
  }
  if (enumValues?.length) {
    options.Values = enumValues;
  }
  if (attribute.Computable === true) {
    options.Computable = true;
  }
  const symbolLookup = resolveNpcDescriptorAssetSymbolLookup(attribute);
  if (symbolLookup) {
    options.SymbolLookup = symbolLookup;
  }
  const stateAutocompleteKind = resolveNpcNodeFieldStateAutocompleteKind(descriptor, attribute);
  if (stateAutocompleteKind) {
    options.StateAutocompleteKind = stateAutocompleteKind;
  }
  const animationAutocompleteKind = resolveNpcNodeFieldAnimationAutocompleteKind(descriptor, attribute);
  if (animationAutocompleteKind) {
    options.AnimationAutocompleteKind = animationAutocompleteKind;
  }

  return {
    Id: attribute.Name,
    Type: type,
    Description: normalizeDescription(attribute.ShortDescription),
    Options: options,
  };
}

function resolveNpcNodeFieldStateAutocompleteKind(
  descriptor: Pick<NpcDescriptor, "Category" | "Name">,
  attribute: Pick<NpcDescriptorAttribute, "Name">,
): NpcStateAutocompleteKind | undefined {
  if (attribute.Name === "StartState") {
    return "role-main";
  }

  if (attribute.Name === "BusyStates") {
    return "role-full";
  }

  if (descriptor.Category === "Action" && descriptor.Name === "ParentState" && attribute.Name === "State") {
    return "component-parent-alias";
  }

  if (
    (descriptor.Category === "Action" || descriptor.Category === "Sensor") &&
    descriptor.Name === "State" &&
    attribute.Name === "State"
  ) {
    return "role-full";
  }

  return undefined;
}

function resolveNpcNodeFieldAnimationAutocompleteKind(
  descriptor: Pick<NpcDescriptor, "Category" | "Name">,
  attribute: Pick<NpcDescriptorAttribute, "Name">,
): NpcAnimationAutocompleteKind | undefined {
  if (attribute.Name !== "Animation") {
    return undefined;
  }

  if (
    (descriptor.Category === "Action" && descriptor.Name === "PlayAnimation") ||
    (descriptor.Category === "Sensor" && descriptor.Name === "Animation")
  ) {
    return "appearance-model";
  }

  return undefined;
}

export function buildReferenceField(): NodeContentDefinition {
  return {
    Id: "Reference",
    Type: "SmallString",
    Description: "Referenced component asset name.",
    Options: {
      Label: "Reference",
      Width: 220,
      Default: "",
      Computable: true,
    },
  };
}

export function buildReferenceNullableField(): NodeContentDefinition {
  return {
    Id: "Nullable",
    Type: "Checkbox",
    Description: "Allow the computed reference to resolve to no component.",
    Options: {
      Label: "Nullable",
      Default: false,
    },
  };
}

export function buildReferenceInterfacesField(): NodeContentDefinition {
  return {
    Id: "Interfaces",
    Type: "List",
    Description: "Allowed component interface codes for a computed reference.",
    Options: {
      Label: "Interfaces",
      DefaultValue: [],
      SymbolLookup: {
        indexKind: "assetDerived",
        key: "npcComponentInterfaces",
      },
    },
  };
}

function resolveFieldType(
  attribute: NpcDescriptorAttribute,
  enumValues: string[] | undefined,
): NodeContentDefinition["Type"] | null {
  switch (attribute.Type) {
    case "Boolean":
      return "Bool";
    case "Asset":
    case "String":
      return "SmallString";
    case "Flag":
      return enumValues?.length ? "Enum" : "SmallString";
    case "AssetArray":
    case "FlagArray":
    case "FlagSet":
    case "StringList":
      return "List";
    case "Float":
    case "Double":
      return "Float";
    case "Int":
    case "Integer":
    case "Long":
      return "Int";
    case "Array":
      if (!canRenderArrayField(attribute)) {
        return null;
      }
      return isFixedSizeArray(attribute) ? "Tuple" : "List";
    case "ObjectRef":
      return null;
    default:
      return null;
  }
}

function canRenderArrayField(attribute: NpcDescriptorAttribute): boolean {
  return (
    getNpcBehaviorChildDomain(
      attribute.Type,
      typeof attribute.Domain === "string" ? attribute.Domain : undefined,
    ) === undefined
  );
}

function isFixedSizeArray(attribute: NpcDescriptorAttribute): boolean {
  return (
    attribute.Type === "Array" &&
    typeof attribute.MinSize === "number" &&
    typeof attribute.MaxSize === "number" &&
    attribute.MinSize >= 0 &&
    attribute.MinSize === attribute.MaxSize
  );
}

function resolveTupleItemType(attribute: NpcDescriptorAttribute): "String" | "Float" | "Int" {
  switch (attribute.Domain) {
    case "Double":
    case "Float":
      return "Float";
    case "integer":
    case "Int":
    case "Integer":
    case "Long":
      return "Int";
    case "TemporalAmount":
    case "String":
    default:
      return "String";
  }
}

function resolveListItemType(attribute: NpcDescriptorAttribute): "String" | "Float" | "Int" {
  switch (attribute.Type) {
    case "Array":
      return resolveTupleItemType(attribute);
    case "AssetArray":
    case "FlagArray":
    case "FlagSet":
    case "StringList":
    default:
      return "String";
  }
}

function shouldUseUniqueItems(attribute: NpcDescriptorAttribute): boolean {
  if (attribute.Type === "FlagSet") {
    return true;
  }

  return (
    attribute.Type === "FlagArray" &&
    typeof attribute.Validator === "object" &&
    attribute.Validator !== null &&
    "Type" in attribute.Validator &&
    attribute.Validator.Type === "EnumArrayNoDuplicates"
  );
}

function applyValidationOptions(
  attribute: NpcDescriptorAttribute,
  type: NodeContentDefinition["Type"],
  options: NodeContentDefinition["Options"],
): void {
  if (attribute.Required === "REQUIRED") {
    options.Required = true;
  }

  if (type === "List" && typeof attribute.MinSize === "number" && attribute.MinSize > 0) {
    options.MinItems = attribute.MinSize;
  }
  if (
    type === "List" &&
    typeof attribute.MaxSize === "number" &&
    attribute.MaxSize >= 0 &&
    attribute.MaxSize < 2147483647
  ) {
    options.MaxItems = attribute.MaxSize;
  }

  if (type !== "List" && type !== "Tuple" && shouldDisallowEmptyString(attribute)) {
    options.DisallowEmpty = true;
  }
  if ((type === "List" || type === "Tuple") && shouldDisallowEmptyListItems(attribute)) {
    options.DisallowEmptyItems = true;
  }
  if (shouldDisallowEmptyList(attribute)) {
    options.MinItems = Math.max(options.MinItems ?? 0, 1);
  }

  const numericBounds = extractNumericBounds(attribute.Validator);
  if (!numericBounds) {
    return;
  }

  if (numericBounds.min !== undefined) {
    options.Min = numericBounds.min;
  }
  if (numericBounds.max !== undefined) {
    options.Max = numericBounds.max;
  }
  if (numericBounds.minExclusive) {
    options.MinExclusive = true;
  }
  if (numericBounds.maxExclusive) {
    options.MaxExclusive = true;
  }
}

function shouldDisallowEmptyString(attribute: NpcDescriptorAttribute): boolean {
  const validator = getValidatorRecord(attribute.Validator);
  if (!validator) {
    return false;
  }

  if (validator.Type === "StringNotEmpty" || validator.Type === "StringNullOrNotEmpty") {
    return true;
  }

  return validator.Type === "StateString" && validator.AllowEmptyMain === false;
}

function shouldDisallowEmptyListItems(attribute: NpcDescriptorAttribute): boolean {
  const validator = getValidatorRecord(attribute.Validator);
  if (!validator) {
    return false;
  }

  if (validator.Type === "StringListNoEmptyStrings" || validator.Type === "StringListNotEmpty") {
    return true;
  }

  return validator.Type === "StateString" && validator.AllowEmptyMain === false;
}

function shouldDisallowEmptyList(attribute: NpcDescriptorAttribute): boolean {
  const validator = getValidatorRecord(attribute.Validator);
  return validator?.Type === "StringListNotEmpty" || validator?.Type === "ArrayNotEmpty";
}

type NumericBounds = {
  min?: number;
  max?: number;
  minExclusive?: boolean;
  maxExclusive?: boolean;
};

function extractNumericBounds(validator: unknown): NumericBounds | undefined {
  const record = getValidatorRecord(validator);
  if (!record) {
    return undefined;
  }

  switch (record.Type) {
    case "Double":
    case "Int":
      return extractSingleNumericBound(record);
    case "DoubleRange":
    case "IntRange":
    case "DoubleSequenceValidator":
    case "IntSequenceValidator":
      return extractNumericRangeBounds(record);
    default:
      return undefined;
  }
}

function extractSingleNumericBound(record: Record<string, unknown>): NumericBounds | undefined {
  const value = typeof record.Value === "number" ? record.Value : undefined;
  if (value === undefined || typeof record.Relation !== "string") {
    return undefined;
  }

  switch (record.Relation) {
    case "Greater":
      return { min: value, minExclusive: true };
    case "GreaterEqual":
      return { min: value };
    case "Less":
      return { max: value, maxExclusive: true };
    case "LessEqual":
      return { max: value };
    case "Equal":
      return { min: value, max: value };
    default:
      return undefined;
  }
}

function extractNumericRangeBounds(record: Record<string, unknown>): NumericBounds | undefined {
  const bounds: NumericBounds = {};
  const lower = typeof record.Lower === "number" ? record.Lower : undefined;
  const upper = typeof record.Upper === "number" ? record.Upper : undefined;

  if (lower !== undefined) {
    bounds.min = lower;
    bounds.minExclusive = record.RelationLower === "Greater";
  }
  if (upper !== undefined) {
    bounds.max = upper;
    bounds.maxExclusive = record.RelationUpper === "Less";
  }

  return bounds.min === undefined && bounds.max === undefined ? undefined : bounds;
}

function getValidatorRecord(validator: unknown): Record<string, unknown> | undefined {
  if (typeof validator !== "object" || validator === null || !("Type" in validator)) {
    return undefined;
  }

  return validator as Record<string, unknown>;
}

function parseDefaultValue(
  attribute: NpcDescriptorAttribute,
): string | number | boolean | unknown[] | undefined {
  const rawValue = attribute.DefaultValue;
  if (rawValue == null) {
    return undefined;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return attribute.Type === "String" || attribute.Type === "Flag" ? "" : undefined;
  }

  switch (attribute.Type) {
    case "Boolean":
      if (trimmed === "true") {
        return true;
      }
      if (trimmed === "false") {
        return false;
      }
      return undefined;
    case "Float":
    case "Double":
    case "Int":
    case "Integer":
    case "Long": {
      const numericValue = Number(trimmed);
      return Number.isFinite(numericValue) ? numericValue : undefined;
    }
    case "AssetArray":
    case "Array":
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return Array.isArray(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    case "FlagArray":
    case "FlagSet":
    case "StringList":
      return parseDescriptorStringListDefault(trimmed);
    default:
      return rawValue;
  }
}

function parseDescriptorStringListDefault(rawValue: string): string[] | undefined {
  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === "string");
    }
  } catch {
    // Descriptor enum defaults are often written as [A, B] rather than JSON strings.
  }

  if (!rawValue.startsWith("[") || !rawValue.endsWith("]")) {
    return undefined;
  }

  return rawValue
    .slice(1, -1)
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
}

function parseEnumValues(domain: unknown): string[] | undefined {
  if (typeof domain !== "string" || !domain.startsWith("[") || !domain.endsWith("]")) {
    return undefined;
  }

  return domain
    .slice(1, -1)
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
}

function getInputWidth(type: NodeContentDefinition["Type"]): number | undefined {
  switch (type) {
    case "Bool":
      return 18;
    case "Float":
    case "Int":
      return 88;
    case "List":
    case "Tuple":
      return 240;
    default:
      return 220;
  }
}
