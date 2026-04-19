import { describe, expect, test } from "vitest";

import {
  buildListItemInputId,
  getListAutocompleteValues,
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
