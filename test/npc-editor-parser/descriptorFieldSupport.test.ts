import { describe, expect, test } from "vitest";
import {
  inferPrimitiveNpcFieldShapeFromDescriptor,
  parseNpcDescriptorDefaultValue,
  parseNpcDescriptorStaticSuggestions,
} from "../../webview/hytale-npc-role-editor/src/descriptorFieldSupport";

describe("npc descriptor field support", () => {
  test("maps string and enum-backed list descriptor types to list fields", () => {
    expect(
      inferPrimitiveNpcFieldShapeFromDescriptor({
        Name: "BusyStates",
        Type: "StringList",
      }),
    ).toMatchObject({
      kind: "list",
      itemType: "string",
    });

    expect(
      inferPrimitiveNpcFieldShapeFromDescriptor({
        Name: "NavStates",
        Type: "FlagSet",
      }),
    ).toMatchObject({
      kind: "list",
      itemType: "string",
    });

    expect(
      inferPrimitiveNpcFieldShapeFromDescriptor({
        Name: "AttitudesByPriority",
        Type: "FlagArray",
      }),
    ).toMatchObject({
      kind: "list",
      itemType: "string",
    });
  });

  test("parses non-json string-array defaults from descriptors", () => {
    expect(
      parseNpcDescriptorDefaultValue({
        Name: "BusyStates",
        Type: "StringList",
        DefaultValue: "[Idle.Patrol, Search]",
      }),
    ).toEqual(["Idle.Patrol", "Search"]);

    expect(
      parseNpcDescriptorDefaultValue({
        Name: "EnumSet",
        Type: "FlagSet",
        DefaultValue: "[Flock, Collisions]",
      }),
    ).toEqual(["Flock", "Collisions"]);

    expect(
      parseNpcDescriptorDefaultValue({
        Name: "Items",
        Type: "AssetArray",
        DefaultValue: "[*]",
      }),
    ).toEqual(["*"]);

    expect(
      parseNpcDescriptorDefaultValue({
        Name: "StringArray",
        Type: "Array",
        Domain: "String",
        DefaultValue: "[a, b]",
      }),
    ).toEqual(["a", "b"]);
  });

  test("parses static suggestions from flag descriptions", () => {
    expect(
      parseNpcDescriptorStaticSuggestions({
        Name: "Attitudes",
        Type: "FlagSet",
        FlagDescriptions: {
          HOSTILE: "Attack on sight",
          FRIENDLY: "Help this target",
        },
      }),
    ).toEqual(["Hostile", "Friendly"]);
  });
});
