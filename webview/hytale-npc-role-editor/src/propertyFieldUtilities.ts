import type { NpcComputeJson } from "./parsing/documentTypes";
import { isNpcComputeJson, isRecord } from "./parsing/documentTypes";
import type {
  NpcFieldValue,
  NpcPropertyField,
  NpcStateTransitionEdge,
  NpcStateTransitionEntry,
} from "./propertyTypes";

export function getNpcFieldTypeLabel(field: NpcPropertyField): string {
  if (field.value.kind === "compute") {
    return "Compute";
  }

  switch (field.kind) {
    case "string":
      return "String";
    case "number":
      return "Number";
    case "boolean":
      return "Boolean";
    case "list":
      if (field.itemType === "number") {
        const literalValue = field.value.kind === "literal" ? field.value.value : undefined;
        if (
          Array.isArray(literalValue) &&
          literalValue.length === 2 &&
          literalValue.every(item => typeof item === "number")
        ) {
          return "Range [min,max]";
        }

        return "Number List";
      }

      if (field.itemType === "boolean") {
        return "Boolean List";
      }

      return "String List";
    case "rawJson":
      return "Raw JSON";
    case "graph":
      return "Graph";
    case "richObject":
      return "Structured Content";
    case "stateTransitions":
      return "State Transitions";
  }
}

export function createDefaultParameterField(parameterName: string): NpcPropertyField {
  return {
    id: `parameter-${parameterName}`,
    key: parameterName,
    label: parameterName,
    fieldPath: `Parameters.${parameterName}.Value`,
    kind: "string",
    value: {
      kind: "literal",
      value: "",
    },
    canRename: true,
    canChangeType: true,
    canUnset: true,
    isDescriptionEditable: true,
    computable: true,
    isSet: true,
    ui: {},
  };
}

export function createVariantModifyOverrideFieldFromParent(
  inheritedField: NpcPropertyField,
): NpcPropertyField {
  return {
    ...cloneNpcPropertyField(inheritedField),
    id: `modify-${inheritedField.key}`,
    label: humanize(inheritedField.key) ?? inheritedField.key,
    fieldPath: `Modify.${inheritedField.key}`,
    computable: true,
    canRename: false,
    canChangeType: false,
    canUnset: true,
    isDescriptionEditable: false,
    isSet: true,
    ui: {},
  };
}

export function coerceFieldValueToEmptyLiteral(field: NpcPropertyField): NpcFieldValue {
  switch (field.kind) {
    case "string":
      return { kind: "literal", value: "" };
    case "number":
      return { kind: "literal", value: 0 };
    case "boolean":
      return { kind: "literal", value: false };
    case "list":
      return { kind: "literal", value: [] };
    case "rawJson":
    case "graph":
      return { kind: "literal", value: {} };
    case "richObject":
      return {
        kind: "literal",
        value: field.structureKind === "array" ? [] : {},
      };
    case "stateTransitions":
      return { kind: "literal", value: [] };
  }
}

export function coerceLiteralValueToComputeExpression(field: NpcPropertyField): string {
  if (field.value.kind === "compute") {
    return field.value.expression;
  }

  const literalValue = field.value.value;
  if (typeof literalValue === "string") {
    return literalValue;
  }

  if (typeof literalValue === "number" || typeof literalValue === "boolean") {
    return String(literalValue);
  }

  if (Array.isArray(literalValue)) {
    return JSON.stringify(literalValue);
  }

  return "";
}

export function cloneNpcPropertyField(field: NpcPropertyField): NpcPropertyField {
  return {
    ...field,
    value:
      field.value.kind === "compute"
        ? {
            kind: "compute",
            expression: field.value.expression,
          }
        : {
            kind: "literal",
            value: cloneJsonLike(field.value.value),
          },
    staticSuggestions: field.staticSuggestions ? [...field.staticSuggestions] : undefined,
    rootType: field.rootType,
    shapeKey: field.shapeKey,
    structureKind: field.structureKind,
    childFields: field.childFields?.map(childField => cloneNpcPropertyField(childField)),
    keyOrder: field.keyOrder ? [...field.keyOrder] : undefined,
    itemShapeKey: field.itemShapeKey,
    variantType: field.variantType,
    typeSuggestions: field.typeSuggestions ? [...field.typeSuggestions] : undefined,
    transitions: field.transitions?.map(cloneStateTransitionEntry),
    symbolRef: field.symbolRef ? { ...field.symbolRef } : undefined,
    animationAutocompleteKind: field.animationAutocompleteKind,
    preservedData: field.preservedData ? cloneJsonLike(field.preservedData) : undefined,
    ui: field.ui ? { ...field.ui } : undefined,
  };
}

export function cloneJsonLike<T>(value: T): T {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => cloneJsonLike(item)) as T;
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, cloneJsonLike(childValue)]),
    ) as T;
  }

  return value;
}

export function cloneOptionalFieldValue(value: NpcFieldValue | undefined): NpcFieldValue | undefined {
  if (!value) {
    return undefined;
  }

  return value.kind === "compute"
    ? {
        kind: "compute",
        expression: value.expression,
      }
    : {
        kind: "literal",
        value: cloneJsonLike(value.value),
      };
}

export function normalizeFlagValue(value: string): string {
  if (!/^[A-Z0-9_]+$/.test(value)) {
    return value;
  }

  return value
    .split("_")
    .filter(Boolean)
    .map(segment => segment.charAt(0) + segment.slice(1).toLowerCase())
    .join("");
}

export function normalizeTypeHint(
  typeHint: unknown,
): "string" | "number" | "boolean" | undefined {
  if (typeof typeHint !== "string" || !typeHint.trim()) {
    return undefined;
  }

  const normalized = typeHint.trim().toLowerCase();
  if (normalized === "string") {
    return "string";
  }
  if (normalized === "number" || normalized === "double") {
    return "number";
  }
  if (normalized === "boolean") {
    return "boolean";
  }
  return undefined;
}

export function inferItemTypeFromPrimitiveList(
  value: Array<string | number | boolean>,
): "string" | "number" | "boolean" | undefined {
  if (value.every(item => typeof item === "string")) {
    return "string";
  }

  if (value.every(item => typeof item === "number")) {
    return "number";
  }

  if (value.every(item => typeof item === "boolean")) {
    return "boolean";
  }

  return undefined;
}

export function getTypeHintForItemType(
  itemType: NpcPropertyField["itemType"],
): string | undefined {
  if (itemType === "string") {
    return "String";
  }
  if (itemType === "number") {
    return "Number";
  }
  if (itemType === "boolean") {
    return "Boolean";
  }
  return undefined;
}

export function isPrimitiveListItem(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

export function humanize(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  if (!normalized) {
    return null;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function toOptionalDisplayString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

export function parseOptionalBooleanFieldValue(value: unknown): NpcFieldValue | undefined {
  if (isNpcComputeJson(value)) {
    return {
      kind: "compute",
      expression: value.Compute,
    };
  }

  if (typeof value === "boolean") {
    return {
      kind: "literal",
      value,
    };
  }

  return undefined;
}

export function serializeFieldValue(value: NpcFieldValue): unknown {
  if (value.kind === "compute") {
    return {
      Compute: value.expression,
    } satisfies NpcComputeJson;
  }

  return cloneJsonLike(value.value);
}

export function createStateTransitionEntryId(index: number): string {
  return `state-transition-${index}`;
}

export function createStateTransitionEdgeId(index: number): string {
  return `state-transition-edge-${index}`;
}

function cloneStateTransitionEntry(entry: NpcStateTransitionEntry): NpcStateTransitionEntry {
  return {
    ...entry,
    enabled: cloneOptionalFieldValue(entry.enabled),
    edges: entry.edges.map(cloneStateTransitionEdge),
    actionsField: cloneNpcPropertyField(entry.actionsField),
    preservedData: entry.preservedData ? cloneJsonLike(entry.preservedData) : undefined,
    ui: entry.ui ? { ...entry.ui } : undefined,
  };
}

function cloneStateTransitionEdge(edge: NpcStateTransitionEdge): NpcStateTransitionEdge {
  return {
    ...edge,
    from: [...edge.from],
    to: [...edge.to],
    enabled: cloneOptionalFieldValue(edge.enabled),
    preservedData: edge.preservedData ? cloneJsonLike(edge.preservedData) : undefined,
  };
}
