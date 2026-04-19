import type { IndexReference } from "@shared/indexTypes";

export function buildListItemInputId(inputId: string, index: number): string {
  return `${inputId}-item-${index}`;
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
