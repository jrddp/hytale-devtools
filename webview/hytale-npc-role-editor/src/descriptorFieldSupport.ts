import type { NpcDescriptorAttribute } from "@shared/npc-role-editor/descriptorTypes";
import { resolveNpcDescriptorAssetSymbolLookup } from "@shared/npc-role-editor/assetSymbolLookup";
import type { IndexReference } from "@shared/indexTypes";
import type { NpcPropertyField } from "./propertyTypes";
import {
  cloneJsonLike,
  inferItemTypeFromPrimitiveList,
  isPrimitiveListItem,
  normalizeFlagValue,
  normalizeTypeHint,
} from "./propertyFieldUtilities";

export function inferPrimitiveNpcFieldShapeFromDescriptor(
  descriptorAttribute?: NpcDescriptorAttribute,
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
    case "Array":
      return {
        kind: "list",
        value: { kind: "literal", value: [] },
        itemType: normalizedDomain ?? "string",
      };
    case "AssetArray":
    case "FlagArray":
    case "FlagSet":
    case "StringList":
      return {
        kind: "list",
        value: { kind: "literal", value: [] },
        itemType: "string",
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
      return {
        kind: "rawJson",
        value: { kind: "literal", value: {} },
      };
  }
}

export function inferPrimitiveNpcLiteralFieldShape(
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

export function parseNpcDescriptorDefaultValue(
  attribute: NpcDescriptorAttribute,
): unknown {
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
      return parseDescriptorArrayDefaultValue(defaultValue, normalizeTypeHint(attribute.Domain));
    case "AssetArray":
    case "FlagArray":
    case "FlagSet":
    case "StringList":
      return parseStringArrayDefaultValue(defaultValue);
    default:
      return undefined;
  }
}

export function parseNpcDescriptorStaticSuggestions(
  descriptorAttribute?: NpcDescriptorAttribute,
): string[] | undefined {
  const rawFlagDescriptions = descriptorAttribute?.FlagDescriptions;
  if (!rawFlagDescriptions || typeof rawFlagDescriptions !== "object") {
    return undefined;
  }

  const values = Object.keys(rawFlagDescriptions).map(normalizeFlagValue);
  return values.length > 0 ? values : undefined;
}

export function resolveNpcDescriptorFieldSymbolRef(
  descriptorAttribute?: NpcDescriptorAttribute,
): IndexReference | undefined {
  return resolveNpcDescriptorAssetSymbolLookup(descriptorAttribute);
}

function parseDescriptorArrayDefaultValue(
  defaultValue: string,
  normalizedDomain?: "string" | "number" | "boolean",
): unknown {
  const parsedJsonArray = tryParseJsonArray(defaultValue);
  if (parsedJsonArray !== undefined) {
    return parsedJsonArray;
  }

  if (normalizedDomain === "string") {
    return parseStringArrayDefaultValue(defaultValue);
  }

  return undefined;
}

function parseStringArrayDefaultValue(defaultValue: string): string[] | undefined {
  const parsedJsonArray = tryParseJsonArray(defaultValue);
  if (parsedJsonArray !== undefined) {
    return parsedJsonArray
      .filter((value): value is string => typeof value === "string")
      .map(value => value.trim())
      .filter(Boolean);
  }

  const trimmed = defaultValue.trim();
  const inner =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1).trim()
      : trimmed;
  if (!inner) {
    return [];
  }

  return inner
    .split(",")
    .map(part => stripOptionalQuotes(part.trim()))
    .filter(Boolean);
}

function tryParseJsonArray(defaultValue: string): unknown[] | undefined {
  try {
    const parsed = JSON.parse(defaultValue);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function stripOptionalQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }

  return value;
}
