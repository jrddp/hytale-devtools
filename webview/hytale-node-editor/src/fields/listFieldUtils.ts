import type { IndexReference } from "@shared/indexTypes";

export function buildListItemInputId(inputId: string, index: number): string {
  return `${inputId}-item-${index}`;
}

export function getListAddPlaceholder({
  itemCount,
  defaultPlaceholder,
}: {
  itemCount: number;
  defaultPlaceholder?: string;
}): string {
  if (itemCount === 0 && defaultPlaceholder && defaultPlaceholder.trim().length > 0) {
    return defaultPlaceholder;
  }

  return "Add item...";
}

export function shouldAppendStringListItem(value: string): boolean {
  return value.trim().length > 0;
}

export function shouldRemoveStringListItem(value: string): boolean {
  return value.trim().length === 0;
}

export function shouldRequestListAutocomplete(
  overrideAutocompleteValues: string[] | undefined,
  symbolLookup: IndexReference | undefined,
): boolean {
  return overrideAutocompleteValues === undefined && symbolLookup !== undefined;
}

export function getListAutocompleteValues({
  itemInputId,
  overrideAutocompleteValues,
  symbolLookup,
  autocompleteField,
  autocompleteValues,
  items,
  currentItemIndex,
  uniqueItems,
}: {
  itemInputId: string;
  overrideAutocompleteValues?: string[];
  symbolLookup?: IndexReference;
  autocompleteField?: string;
  autocompleteValues: string[];
  items?: unknown[];
  currentItemIndex?: number;
  uniqueItems?: boolean;
}): string[] {
  const values = resolveListAutocompleteValues({
    itemInputId,
    overrideAutocompleteValues,
    symbolLookup,
    autocompleteField,
    autocompleteValues,
  });

  if (uniqueItems !== true) {
    return values;
  }

  return filterUsedAutocompleteValues(values, items ?? [], currentItemIndex);
}

function resolveListAutocompleteValues({
  itemInputId,
  overrideAutocompleteValues,
  symbolLookup,
  autocompleteField,
  autocompleteValues,
}: {
  itemInputId: string;
  overrideAutocompleteValues?: string[];
  symbolLookup?: IndexReference;
  autocompleteField?: string;
  autocompleteValues: string[];
}): string[] {
  if (overrideAutocompleteValues !== undefined) {
    return overrideAutocompleteValues;
  }

  if (symbolLookup !== undefined && autocompleteField === itemInputId) {
    return autocompleteValues;
  }

  return [];
}

function filterUsedAutocompleteValues(
  values: string[],
  items: unknown[],
  currentItemIndex: number | undefined,
): string[] {
  const currentValue =
    currentItemIndex !== undefined && typeof items[currentItemIndex] === "string"
      ? items[currentItemIndex].trim()
      : "";
  const usedValues = new Set(
    items
      .filter((_, index) => index !== currentItemIndex)
      .map(value => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean),
  );

  return values.filter(value => value === currentValue || !usedValues.has(value));
}
