import { describe, expect, test } from "vitest";
import { schemaDefinitionToAssetDefinition } from "../../src/schema/schemaToFieldResolver";
import type { SchemaDefinition } from "../../src/schema/schemaDefinitionTypes";
import type { InlineOrReferenceField } from "../../src/shared/fieldTypes";

describe("asset editor schemaToFieldResolver", () => {
  test("passes wrapper symbol refs to inline-or-reference string fields", () => {
    const symbolRef = {
      indexKind: "registeredAssets",
      key: "RootInteraction",
    } as const;
    const definition: SchemaDefinition = {
      $id: "InlineReferenceTest.json",
      title: "InlineReferenceTest",
      type: "object",
      hytale: {
        mergesProperties: true,
      },
      properties: {
        Interaction: {
          anyOf: [
            {
              type: "string",
              hytale: {
                type: "string",
              },
            },
            {
              $ref: "RootInteraction.json#",
            },
          ],
          hytaleDevtools: {
            symbolRef,
          },
        },
      },
    };

    const asset = schemaDefinitionToAssetDefinition(definition, [], console);
    const interactionField = asset?.rootField.type === "object"
      ? asset.rootField.properties.Interaction as InlineOrReferenceField
      : undefined;

    expect(interactionField?.type).toBe("inlineOrReference");
    expect(interactionField?.stringField.symbolRef).toEqual(symbolRef);
  });
});
