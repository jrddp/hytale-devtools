import { describe, expect, test } from "vitest";
import type { AssetDefinition } from "../../src/shared/fieldTypes";
import {
  getFieldInputId,
  getFieldPanelIdForPointer,
  getFieldPanelId,
} from "../../webview/hytale-asset-editor/src/components/fieldEditorIds";
import type {
  ArrayFieldInstance,
  MapFieldInstance,
  ObjectFieldInstance,
} from "../../webview/hytale-asset-editor/src/parsing/fieldInstances";
import { parseDocumentText } from "../../webview/hytale-asset-editor/src/parsing/parseDocument";

describe("asset editor field paths", () => {
  test("builds nested field paths for map and array children", () => {
    const assetDefinition: AssetDefinition = {
      title: "FieldPathTest",
      buttons: [],
      refDependencies: new Set(),
      rootField: {
        schemaKey: "$root",
        type: "object",
        section: "General",
        properties: {
          Tags: {
            schemaKey: "Tags",
            type: "map",
            section: "General",
            keyField: {
              schemaKey: "$key",
              type: "string",
              section: "General",
            },
            valueField: {
              schemaKey: "Value",
              type: "array",
              section: "General",
              items: {
                schemaKey: "Item",
                type: "string",
                section: "General",
              },
            },
          },
        },
      },
    };

    const result = parseDocumentText({
      text: JSON.stringify({
        Tags: {
          Test: ["One"],
        },
      }),
      assetDefinition,
      assetsByRef: {},
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }

    const root = result.rootField as ObjectFieldInstance;
    const tags = root.properties.Tags as MapFieldInstance;
    const values = tags.entries[0].valueField as ArrayFieldInstance;
    const item = values.items[0];

    expect(tags.fieldPath).toBe("Tags");
    expect(values.fieldPath).toBe("Tags/Test");
    expect(item.fieldPath).toBe("Tags/Test/0");
    expect(getFieldPanelId(item)).toBe("asset-Tags/Test/0");
    expect(getFieldInputId(item)).toBe("asset-Tags/Test/0-input");
    expect(getFieldPanelIdForPointer("Tags/Test/0")).toBe("asset-Tags/Test/0");
    expect(getFieldPanelIdForPointer("/Tags/Test/0")).toBe("asset-Tags/Test/0");
  });
});
