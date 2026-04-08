import type {
  NpcFieldKind,
  NpcFieldValue,
  NpcPropertyField,
} from "../propertyModel";

export type NpcStandardParameterEditorType =
  | "string"
  | "number"
  | "boolean"
  | "range"
  | "stringList"
  | "numberList"
  | "compute";

export type StandardParameterEditableTypeOption = {
  value: NpcStandardParameterEditorType;
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
  field: Pick<NpcPropertyField, "kind" | "value" | "itemType">,
): NpcStandardParameterEditorType {
  if (field.value.kind === "compute") {
    return "compute";
  }

  switch (field.kind) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "list": {
      const literalValue = field.value.value;
      if (
        field.itemType === "number" &&
        Array.isArray(literalValue) &&
        literalValue.length === 2 &&
        literalValue.every(item => typeof item === "number")
      ) {
        return "range";
      }

      return field.itemType === "number" ? "numberList" : "stringList";
    }
    case "rawJson":
    case "graph":
      return "string";
  }
}

export function getStandardParameterEditorTypeLabel(
  type: NpcStandardParameterEditorType,
): string {
  return (
    STANDARD_PARAMETER_EDITOR_TYPE_OPTIONS.find(option => option.value === type)?.label ?? "String"
  );
}

export function coerceFieldStateForStandardParameterEditorType(
  previousValue: NpcFieldValue,
  nextType: NpcStandardParameterEditorType,
): Pick<NpcPropertyField, "kind" | "value" | "itemType"> {
  const currentValue =
    previousValue.kind === "compute" ? previousValue.expression : previousValue.value;

  switch (nextType) {
    case "string":
      return {
        kind: "string",
        value: {
          kind: "literal",
          value: coerceScalarString(currentValue),
        },
      };
    case "number":
      return {
        kind: "number",
        value: {
          kind: "literal",
          value: coerceScalarNumber(currentValue),
        },
      };
    case "boolean":
      return {
        kind: "boolean",
        value: {
          kind: "literal",
          value: coerceScalarBoolean(currentValue),
        },
      };
    case "compute":
      return {
        kind: "string",
        value: {
          kind: "compute",
          expression: coerceComputeExpression(currentValue),
        },
      };
    case "range":
      return {
        kind: "list",
        itemType: "number",
        value: {
          kind: "literal",
          value: coerceRange(currentValue),
        },
      };
    case "stringList":
      return {
        kind: "list",
        itemType: "string",
        value: {
          kind: "literal",
          value: coercePrimitiveList(currentValue, "string"),
        },
      };
    case "numberList":
      return {
        kind: "list",
        itemType: "number",
        value: {
          kind: "literal",
          value: coercePrimitiveList(currentValue, "number"),
        },
      };
  }
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
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
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

  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "true") {
      return true;
    }
    if (trimmed === "false") {
      return false;
    }
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return false;
}

function coerceRange(value: unknown): [number, number] {
  if (Array.isArray(value) && value.length >= 2) {
    return [coerceScalarNumber(value[0]), coerceScalarNumber(value[1])];
  }

  const numericValue = coerceScalarNumber(value);
  return [numericValue, numericValue];
}

function coercePrimitiveList(
  value: unknown,
  itemType: Exclude<NpcFieldKind, "rawJson" | "graph" | "list">,
): Array<string | number | boolean> {
  if (Array.isArray(value) && value.every(isPrimitiveListItem)) {
    return value.map(item => coerceListItem(item, itemType));
  }

  if (typeof value === "string") {
    if (!value.trim()) {
      return [];
    }

    return [coerceListItem(value, itemType)];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [coerceListItem(value, itemType)];
  }

  return [];
}

function coerceListItem(
  value: string | number | boolean,
  itemType: Exclude<NpcFieldKind, "rawJson" | "graph" | "list">,
): string | number | boolean {
  switch (itemType) {
    case "string":
      return coerceScalarString(value);
    case "number":
      return coerceScalarNumber(value);
    case "boolean":
      return coerceScalarBoolean(value);
  }
}
