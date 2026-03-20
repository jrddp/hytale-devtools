import { describe, expect, test } from "vitest";
import { schemaDefinitionToAssetDefinition } from "../../src/schema/schemaToFieldResolver";
import type { SchemaDefinition } from "../../src/schema/schemaDefinitionTypes";
import { transferMetadata } from "../../webview/hytale-asset-editor/src/components/fieldHelpers";

describe("asset editor readonly metadata", () => {
  test("maps schema readOnly flags onto field definitions", () => {
    const definition: SchemaDefinition = {
      $id: "ReadonlyTest.json",
      title: "ReadonlyTest",
      type: "object",
      hytale: {
        mergesProperties: true,
      },
      properties: {
        LockedName: {
          type: "string",
          readOnly: true,
          hytale: {
            type: "string",
          },
        },
      },
    };

    const asset = schemaDefinitionToAssetDefinition(definition, [], console);

    expect(asset).not.toBeNull();
    expect(asset?.rootField.type).toBe("object");
    expect(asset?.rootField.properties.LockedName.readonly).toBe(true);
  });

  test("preserves readonly when transferring metadata to resolved refs", () => {
    const source = {
      schemaKey: "LockedRef",
      type: "ref",
      section: "General",
      collapsedByDefault: false,
      readonly: true,
      $ref: "LockedAsset.json#",
    } as const;
    const target = {
      schemaKey: null,
      type: "object",
      section: "General",
      collapsedByDefault: false,
      properties: {},
      unparsedData: {},
    };

    const result = transferMetadata(source, target);

    expect(result.readonly).toBe(true);
  });
});
