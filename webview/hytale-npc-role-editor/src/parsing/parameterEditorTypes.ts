import type {
  NpcStandardParameterEditorType,
  NpcStandardParameterEntry,
  NpcStandardParameterValue,
} from "./documentTypes";

export type StandardParameterEditableTypeOption = {
  value: Exclude<NpcStandardParameterEditorType, "rawJson">;
  label: string;
};

export const STANDARD_PARAMETER_EDITOR_TYPE_OPTIONS: StandardParameterEditableTypeOption[] = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "range", label: "Range [min,max]" },
  { value: "stringList", label: "String List" },
  { value: "numberList", label: "Number List" },
  { value: "compute", label: "Compute" },
];

export function getStandardParameterEditorType(
  entry: Pick<NpcStandardParameterEntry, "value" | "typeHint">,
): NpcStandardParameterEditorType {
  if (entry.value.kind === "compute") {
    return "compute";
  }

  const literalValue = entry.value.value;

  if (typeof literalValue === "string") {
    return "string";
  }

  if (typeof literalValue === "number") {
    return "number";
  }

  if (typeof literalValue === "boolean") {
    return "boolean";
  }

  if (Array.isArray(literalValue) && literalValue.every(isPrimitiveListItem)) {
    if (literalValue.every(item => typeof item === "number") && literalValue.length === 2) {
      return "range";
    }

    if (literalValue.every(item => typeof item === "string")) {
      return "stringList";
    }

    if (literalValue.every(item => typeof item === "number")) {
      return "numberList";
    }

    if (literalValue.every(item => typeof item === "boolean")) {
      return "booleanList";
    }
  }

  if (Array.isArray(literalValue) && literalValue.length === 0) {
    switch (normalizeTypeHint(entry.typeHint)) {
      case "String":
        return "stringList";
      case "Number":
        return "numberList";
      case "Boolean":
        return "booleanList";
      default:
        return "stringList";
    }
  }

  return "rawJson";
}

export function getStandardParameterEditorTypeLabel(
  type: NpcStandardParameterEditorType,
): string {
  switch (type) {
    case "string":
      return "String";
    case "number":
      return "Number";
    case "boolean":
      return "Boolean";
    case "range":
      return "Range [min,max]";
    case "stringList":
      return "String List";
    case "numberList":
      return "Number List";
    case "booleanList":
      return "Boolean List";
    case "compute":
      return "Compute";
    case "rawJson":
      return "Raw JSON";
  }
}

export function coerceStandardParameterValueForEditorType(
  previousValue: NpcStandardParameterValue,
  nextType: Exclude<NpcStandardParameterEditorType, "rawJson">,
): NpcStandardParameterValue {
  const literalValue =
    previousValue.kind === "literal" ? previousValue.value : previousValue.expression;

  switch (nextType) {
    case "string":
      return {
        kind: "literal",
        value: coerceScalarString(literalValue),
      };
    case "number":
      return {
        kind: "literal",
        value: coerceScalarNumber(literalValue),
      };
    case "boolean":
      return {
        kind: "literal",
        value: coerceScalarBoolean(literalValue),
      };
    case "compute":
      return {
        kind: "compute",
        expression: coerceComputeExpression(literalValue),
      };
    case "range":
      return {
        kind: "literal",
        value: coerceRange(literalValue),
      };
    case "stringList":
      return {
        kind: "literal",
        value: coercePrimitiveList(literalValue, "string"),
      };
    case "numberList":
      return {
        kind: "literal",
        value: coercePrimitiveList(literalValue, "number"),
      };
    case "booleanList":
      return {
        kind: "literal",
        value: coercePrimitiveList(literalValue, "boolean"),
      };
  }
}

export function getTypeHintForEditorType(
  type: Exclude<NpcStandardParameterEditorType, "rawJson">,
): string | undefined {
  switch (type) {
    case "compute":
      return undefined;
    case "stringList":
      return "String";
    case "numberList":
    case "range":
      return "Number";
    case "booleanList":
      return "Boolean";
    default:
      return undefined;
  }
}

function normalizeTypeHint(typeHint: string | undefined): string | undefined {
  if (!typeHint?.trim()) {
    return undefined;
  }

  const normalized = typeHint.trim().toLowerCase();
  if (normalized === "string") {
    return "String";
  }
  if (normalized === "number") {
    return "Number";
  }
  if (normalized === "boolean") {
    return "Boolean";
  }
  return undefined;
}

function isPrimitiveListItem(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function coerceScalarString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function coerceComputeExpression(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value) && value.every(isPrimitiveListItem)) {
    return JSON.stringify(value);
  }

  return "";
}

function coerceScalarNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  return 0;
}

function coerceScalarBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return false;
}

function coerceRange(value: unknown): [number, number] {
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    return [value[0], value[1]];
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return [value, value];
  }

  return [0, 0];
}

function coercePrimitiveList(
  value: unknown,
  itemType: "string" | "number" | "boolean",
): Array<string | number | boolean> {
  const sourceValues = Array.isArray(value)
    ? value.filter(isPrimitiveListItem)
    : isPrimitiveListItem(value)
      ? [value]
      : [];

  switch (itemType) {
    case "string":
      return sourceValues.map(item => String(item));
    case "number":
      return sourceValues
        .map(item => (typeof item === "number" ? item : Number(item)))
        .filter(item => !Number.isNaN(item));
    case "boolean":
      return sourceValues.map(item => {
        if (typeof item === "boolean") {
          return item;
        }
        if (typeof item === "number") {
          return item !== 0;
        }
        const normalized = item.trim().toLowerCase();
        return normalized === "true";
      });
  }
}
