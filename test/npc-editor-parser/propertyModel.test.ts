import { describe, expect, test } from "vitest";
import { buildNpcPropertySections } from "../../webview/hytale-npc-role-editor/src/propertyModel";
import { buildParameterUsageIndex } from "../../webview/hytale-npc-role-editor/src/compute/parameterUsageIndex";
import { buildIssuesByFieldPath, buildNpcIssues } from "../../webview/hytale-npc-role-editor/src/issues";
import type {
  NpcDescriptorDocument,
} from "../../src/shared/npc-role-editor/descriptorTypes";
import type { NpcDocument, NpcStandardParameterEntry } from "../../webview/hytale-npc-role-editor/src/parsing/documentTypes";

function createParameterEntry(
  name: string,
  value: NpcStandardParameterEntry["value"],
): NpcStandardParameterEntry {
  return {
    name,
    value,
    keyOrder: ["Value"],
    extraFields: {},
  };
}

describe("npc property model symbol enrichment", () => {
  test("enriches parameters from direct-translation role attributes", () => {
    const document: NpcDocument = {
      roleType: "Generic",
      rawRoot: {
        Type: "Generic",
        Appearance: {
          Compute: "Appearance",
        },
        HotbarItems: {
          Compute: "HotbarItems",
        },
        Parameters: {
          Appearance: {
            Value: "",
          },
          HotbarItems: {
            Value: [],
          },
        },
      },
      parameters: {
        entries: [
          createParameterEntry("Appearance", { kind: "literal", value: "" }),
          createParameterEntry("HotbarItems", { kind: "literal", value: [] }),
        ],
        importStates: null,
        excludedEntries: {},
        keyOrder: ["Appearance", "HotbarItems"],
      },
    };

    const descriptors: NpcDescriptorDocument = [
      {
        Name: "Generic",
        Category: "Role",
        Attributes: [
          {
            Name: "Appearance",
            Type: "Asset",
            Domain: "Model",
            Computable: true,
          },
          {
            Name: "HotbarItems",
            Type: "AssetArray",
            Domain: "Item",
            Computable: true,
          },
        ],
      },
    ];

    const sections = buildNpcPropertySections(
      document,
      descriptors,
      buildParameterUsageIndex(document.rawRoot),
      [],
    );

    const parameterSection = sections.find(section => section.id === "npc-section-parameters");
    expect(parameterSection).toBeDefined();

    const appearanceField = parameterSection?.fields.find(field => field.key === "Appearance");
    expect(appearanceField).toMatchObject({
      type: "parameter",
      symbolRef: {
        indexKind: "registeredAssets",
        key: "ModelAsset",
      },
    });

    const hotbarItemsField = parameterSection?.fields.find(field => field.key === "HotbarItems");
    expect(hotbarItemsField).toMatchObject({
      type: "parameter",
      itemSymbolRef: {
        indexKind: "registeredAssets",
        key: "Item",
      },
    });
  });

  test("does not enrich a parameter when direct translations are ambiguous", () => {
    const document: NpcDocument = {
      roleType: "Generic",
      rawRoot: {
        Type: "Generic",
        Appearance: {
          Compute: "Appearance",
        },
        Model: {
          Compute: "Appearance",
        },
        Parameters: {
          Appearance: {
            Value: "",
          },
        },
      },
      parameters: {
        entries: [createParameterEntry("Appearance", { kind: "literal", value: "" })],
        importStates: null,
        excludedEntries: {},
        keyOrder: ["Appearance"],
      },
    };

    const descriptors: NpcDescriptorDocument = [
      {
        Name: "Generic",
        Category: "Role",
        Attributes: [
          {
            Name: "Appearance",
            Type: "Asset",
            Domain: "Model",
            Computable: true,
          },
          {
            Name: "Model",
            Type: "Asset",
            Domain: "Model",
            Computable: true,
          },
        ],
      },
    ];

    const sections = buildNpcPropertySections(
      document,
      descriptors,
      buildParameterUsageIndex(document.rawRoot),
      [],
    );
    const parameterSection = sections.find(section => section.id === "npc-section-parameters");
    const appearanceField = parameterSection?.fields.find(field => field.key === "Appearance");

    expect(appearanceField).toMatchObject({
      type: "parameter",
    });
    expect("symbolRef" in (appearanceField ?? {})).toBe(true);
    expect((appearanceField as { symbolRef?: unknown } | undefined)?.symbolRef).toBeUndefined();
  });

  test("attaches field issues from the issues map", () => {
    const document: NpcDocument = {
      roleType: "Generic",
      rawRoot: {
        Type: "Generic",
        Parameters: {
          Appearance: {
            Value: "",
          },
        },
      },
      parameters: {
        entries: [createParameterEntry("Appearance", { kind: "literal", value: "" })],
        importStates: null,
        excludedEntries: {},
        keyOrder: ["Appearance"],
      },
    };

    const sections = buildNpcPropertySections(
      document,
      [],
      buildParameterUsageIndex(document.rawRoot),
      [],
      buildIssuesByFieldPath(
        buildNpcIssues(document, buildParameterUsageIndex(document.rawRoot)),
      ),
    );
    const parameterSection = sections.find(section => section.id === "npc-section-parameters");
    const appearanceField = parameterSection?.fields.find(field => field.key === "Appearance");

    expect(appearanceField).toMatchObject({
      issues: [
        {
          severity: "warning",
          code: "unused-parameter",
        },
      ],
    });
  });

  test("adds a dedicated import states field for components", () => {
    const document: NpcDocument = {
      roleType: "Component",
      rawRoot: {
        Type: "Component",
        Parameters: {
          _ImportStates: ["Idle"],
          AlertedRange: {
            Value: 10,
          },
        },
      },
      parameters: {
        entries: [createParameterEntry("AlertedRange", { kind: "literal", value: 10 })],
        importStates: ["Idle"],
        excludedEntries: {},
        keyOrder: ["_ImportStates", "AlertedRange"],
      },
    };

    const sections = buildNpcPropertySections(
      document,
      [],
      buildParameterUsageIndex(document.rawRoot),
      ["Alerted", "Idle", "Search"],
    );
    const parameterSection = sections.find(section => section.id === "npc-section-parameters");
    const importStatesField = parameterSection?.fields[0];

    expect(importStatesField).toMatchObject({
      type: "list",
      fieldPath: "Parameters._ImportStates",
      label: "Import States",
      items: ["Idle"],
      itemAutocompleteValues: ["Alerted", "Idle", "Search"],
    });
  });
});
