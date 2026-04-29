export type ParameterMapValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | { Compute: string }
  | unknown;

export type ParameterMapValueType =
  | "string"
  | "number"
  | "boolean"
  | "range"
  | "stringList"
  | "numberList"
  | "compute"
  | "unsupported";

export type ParameterMapListValueType = Extract<
  ParameterMapValueType,
  "stringList" | "numberList"
>;

export type ParameterMap = Record<string, ParameterMapValue>;

export const PARAMETER_MAP_TYPE_OPTIONS: Array<{
  value: Exclude<ParameterMapValueType, "unsupported">;
  label: string;
}> = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "range", label: "Range [min,max]" },
  { value: "stringList", label: "String List" },
  { value: "numberList", label: "Number List" },
  { value: "compute", label: "Compute" },
];

export function isParameterMap(value: unknown): value is ParameterMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isComputeParameterMapValue(value: unknown): value is { Compute: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as { Compute?: unknown }).Compute === "string"
  );
}

export function getParameterMapValueType(
  value: unknown,
  preferredType?: ParameterMapValueType,
): ParameterMapValueType {
  if (isCompatiblePreferredParameterMapValueType(value, preferredType)) {
    return preferredType;
  }

  if (isComputeParameterMapValue(value)) {
    return "compute";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (Array.isArray(value)) {
    if (value.length === 0 || value.every(item => typeof item === "string")) {
      return "stringList";
    }
    if (value.every(item => typeof item === "number")) {
      return value.length === 2 ? "range" : "numberList";
    }
  }

  return "unsupported";
}

export function isCompatiblePreferredParameterMapValueType(
  value: unknown,
  preferredType: ParameterMapValueType | undefined,
): preferredType is ParameterMapValueType {
  if (!preferredType || preferredType === "unsupported") {
    return false;
  }

  switch (preferredType) {
    case "compute":
      return isComputeParameterMapValue(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "range":
      return (
        Array.isArray(value) &&
        value.length === 2 &&
        value.every(item => typeof item === "number")
      );
    case "stringList":
      return Array.isArray(value) && value.every(item => typeof item === "string");
    case "numberList":
      return Array.isArray(value) && value.every(item => typeof item === "number");
  }
}

export function coerceParameterMapValue(
  previousValue: unknown,
  nextType: Exclude<ParameterMapValueType, "unsupported">,
): string | number | boolean | string[] | number[] | { Compute: string } {
  const scalar = isComputeParameterMapValue(previousValue) ? previousValue.Compute : previousValue;

  switch (nextType) {
    case "string":
      return coerceString(scalar);
    case "number":
      return coerceNumber(scalar);
    case "boolean":
      return coerceBoolean(scalar);
    case "range": {
      const numberList = coercePrimitiveList(scalar, "number");
      const first = typeof numberList[0] === "number" ? numberList[0] : coerceNumber(scalar);
      const second = typeof numberList[1] === "number" ? numberList[1] : first;
      return [first, second];
    }
    case "stringList":
      return coercePrimitiveList(scalar, "string");
    case "numberList":
      return coercePrimitiveList(scalar, "number");
    case "compute":
      return { Compute: coerceComputeExpression(scalar) };
  }
}

export function isEmptyParameterMap(value: unknown): boolean {
  return !isParameterMap(value) || Object.keys(value).length === 0;
}

export function getDefaultParameterMapListItem(
  listType: ParameterMapListValueType,
): string | number {
  switch (listType) {
    case "numberList":
      return 0;
    case "stringList":
      return "";
  }
}

export function addParameterMapListItem(
  value: unknown,
  listType: ParameterMapListValueType,
): string[] | number[] {
  const list = coercePrimitiveListForType(value, listType);
  return [...list, getDefaultParameterMapListItem(listType)] as string[] | number[];
}

export function removeParameterMapListItem(
  value: unknown,
  listType: ParameterMapListValueType,
  index: number,
): string[] | number[] {
  return coercePrimitiveListForType(value, listType).filter(
    (_item, itemIndex) => itemIndex !== index,
  ) as string[] | number[];
}

export function updateParameterMapListItem(
  value: unknown,
  listType: ParameterMapListValueType,
  index: number,
  nextItem: string | number,
): string[] | number[] {
  const list = coercePrimitiveListForType(value, listType);
  const nextList = list.slice();
  nextList[index] = coerceListItemForType(nextItem, listType);
  return nextList as string[] | number[];
}

export function updateParameterMapRangeEndpoint(
  value: unknown,
  index: 0 | 1,
  nextEndpoint: number,
): number[] {
  const numberList = coercePrimitiveList(value, "number");
  const first = typeof numberList[0] === "number" ? numberList[0] : 0;
  const second = typeof numberList[1] === "number" ? numberList[1] : first;
  const nextRange = [first, second];
  nextRange[index] = nextEndpoint;
  return nextRange;
}

function isPrimitiveListItem(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function coerceString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function coerceNumber(value: unknown): number {
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

function coerceBoolean(value: unknown): boolean {
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

function coercePrimitiveList(
  value: unknown,
  itemType: "string",
): string[];
function coercePrimitiveList(
  value: unknown,
  itemType: "number",
): number[];
function coercePrimitiveList(
  value: unknown,
  itemType: "boolean",
): boolean[];
function coercePrimitiveList(
  value: unknown,
  itemType: "string" | "number" | "boolean",
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
  itemType: "string" | "number" | "boolean",
): string | number | boolean {
  switch (itemType) {
    case "string":
      return coerceString(value);
    case "number":
      return coerceNumber(value);
    case "boolean":
      return coerceBoolean(value);
  }
}

function coercePrimitiveListForType(
  value: unknown,
  listType: ParameterMapListValueType,
): Array<string | number> {
  switch (listType) {
    case "stringList":
      return coercePrimitiveList(value, "string");
    case "numberList":
      return coercePrimitiveList(value, "number");
  }
}

function coerceListItemForType(
  value: string | number,
  listType: ParameterMapListValueType,
): string | number {
  switch (listType) {
    case "stringList":
      return coerceString(value);
    case "numberList":
      return coerceNumber(value);
  }
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
