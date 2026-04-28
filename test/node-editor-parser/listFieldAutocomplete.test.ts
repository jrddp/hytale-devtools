import { describe, expect, test } from "vitest";

import {
  buildListItemInputId,
  getListAddPlaceholder,
  getListAutocompleteValues,
  normalizeCommittedStringListItem,
  shouldAppendStringListItem,
  shouldRemoveStringListItem,
  shouldRequestListAutocomplete,
} from "../../webview/hytale-node-editor/src/fields/listFieldUtils";

describe("node editor list field autocomplete helpers", () => {
  test("builds stable per-item input ids", () => {
    expect(buildListItemInputId("field-node-Items", 2)).toBe("field-node-Items-item-2");
  });

  test("prefers override autocomplete values over workspace autocomplete state", () => {
    expect(
      getListAutocompleteValues({
        itemInputId: "field-node-Items-item-0",
        overrideAutocompleteValues: ["One", "Two"],
        symbolLookup: {
          indexKind: "registeredAssets",
          key: "Item",
        },
        autocompleteField: "field-node-Items-item-0",
        autocompleteValues: ["Ignored"],
      }),
    ).toEqual(["One", "Two"]);
  });

  test("uses workspace autocomplete values when the active list item matches the requested field", () => {
    expect(
      getListAutocompleteValues({
        itemInputId: "field-node-Items-item-1",
        symbolLookup: {
          indexKind: "registeredAssets",
          key: "Item",
        },
        autocompleteField: "field-node-Items-item-1",
        autocompleteValues: ["Sword", "Shield"],
      }),
    ).toEqual(["Sword", "Shield"]);
  });

  test("filters used values for unique static list suggestions while preserving the current row value", () => {
    expect(
      getListAutocompleteValues({
        itemInputId: "field-node-Items-item-1",
        overrideAutocompleteValues: ["One", "Two", "Three"],
        autocompleteValues: [],
        items: ["One", "Two"],
        currentItemIndex: 1,
        uniqueItems: true,
      }),
    ).toEqual(["Two", "Three"]);
  });

  test("keeps duplicate suggestions when list items are not unique", () => {
    expect(
      getListAutocompleteValues({
        itemInputId: "field-node-Items-item-1",
        overrideAutocompleteValues: ["One", "Two", "Three"],
        autocompleteValues: [],
        items: ["One", "Two"],
        currentItemIndex: 1,
        uniqueItems: false,
      }),
    ).toEqual(["One", "Two", "Three"]);
  });

  test("filters used values for unique symbol-backed list suggestions", () => {
    expect(
      getListAutocompleteValues({
        itemInputId: "field-node-Items-item-0",
        symbolLookup: {
          indexKind: "registeredAssets",
          key: "Item",
        },
        autocompleteField: "field-node-Items-item-0",
        autocompleteValues: ["Sword", "Shield", "Axe"],
        items: ["Sword", "Shield"],
        currentItemIndex: 0,
        uniqueItems: true,
      }),
    ).toEqual(["Sword", "Axe"]);
  });

  test("filters all used values for a unique trailing add row", () => {
    expect(
      getListAutocompleteValues({
        itemInputId: "field-node-Items-item-2",
        overrideAutocompleteValues: ["One", "Two", "Three"],
        autocompleteValues: [],
        items: ["One", "Two"],
        currentItemIndex: 2,
        uniqueItems: true,
      }),
    ).toEqual(["Three"]);
  });

  test("formats add-row placeholders from defaults only before items are committed", () => {
    expect(getListAddPlaceholder({ itemCount: 0, defaultPlaceholder: "[1, 2]" })).toBe("[1, 2]");
    expect(getListAddPlaceholder({ itemCount: 1, defaultPlaceholder: "[1, 2]" })).toBe("Add item...");
    expect(getListAddPlaceholder({ itemCount: 0 })).toBe("Add item...");
  });

  test("only appends non-empty string list values", () => {
    expect(shouldAppendStringListItem("Value")).toBe(true);
    expect(shouldAppendStringListItem("  ")).toBe(false);
  });

  test("removes existing string list values when committed blank", () => {
    expect(shouldRemoveStringListItem("Value", "Previous")).toBe(false);
    expect(shouldRemoveStringListItem("  ", "Previous")).toBe(true);
  });

  test("preserves existing explicit empty string list values when committed blank", () => {
    expect(shouldRemoveStringListItem("", "")).toBe(false);
    expect(shouldRemoveStringListItem("  ", "")).toBe(false);
    expect(normalizeCommittedStringListItem("  ")).toBe("");
  });

  test("only requests symbol autocomplete when override values are absent", () => {
    expect(
      shouldRequestListAutocomplete(undefined, {
        indexKind: "registeredAssets",
        key: "Item",
      }),
    ).toBe(true);

    expect(
      shouldRequestListAutocomplete(["One"], {
        indexKind: "registeredAssets",
        key: "Item",
      }),
    ).toBe(false);
  });
});
