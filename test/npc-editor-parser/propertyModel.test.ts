import { describe, expect, test } from "vitest";
import {
  applyNpcPropertySectionDerivedState,
  buildNpcPropertyState,
  serializeNpcPropertyState,
} from "../../webview/hytale-npc-role-editor/src/propertyModel";
import { buildParameterUsageIndex } from "../../webview/hytale-npc-role-editor/src/compute/parameterUsageIndex";
import type { NpcDescriptorDocument } from "../../src/shared/npc-role-editor/descriptorTypes";
import type { NpcRoleJson } from "../../webview/hytale-npc-role-editor/src/parsing/documentTypes";
import { serializeNpcDocument } from "../../webview/hytale-npc-role-editor/src/parsing/serializeNpcDocument";

function createGenericDocument({
  roleAttributes = {},
  parameters = {},
}: {
  roleAttributes?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}): NpcRoleJson {
  return {
    Type: "Generic",
    Parameters: parameters,
    ...roleAttributes,
  };
}

function createComponentDocument({
  componentClass = "Instruction",
  parameters = {},
}: {
  componentClass?: string;
  parameters?: Record<string, unknown>;
}): NpcRoleJson {
  return {
    Type: "Component",
    Class: componentClass,
    Parameters: parameters,
  };
}

function createVariantDocument({
  reference = "Template_Base",
  modify = {},
  parameters = {},
}: {
  reference?: unknown;
  modify?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}): NpcRoleJson {
  return {
    Type: "Variant",
    Reference: reference as never,
    Modify: modify,
    Parameters: parameters,
  };
}

describe("npc property model symbol enrichment", () => {
  test("enriches parameters from direct-translation role attributes", () => {
    const document = createGenericDocument({
      roleAttributes: {
        Appearance: {
          Compute: "Appearance",
        },
        HotbarItems: {
          Compute: "HotbarItems",
        },
      },
      parameters: {
        Appearance: {
          Value: "",
        },
        HotbarItems: {
          Value: [],
          TypeHint: "String",
        },
      },
    });

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

    const state = buildNpcPropertyState({
      document,
      topLevelKeyOrder: Object.keys(document),
      descriptors,
    });
    applyNpcPropertySectionDerivedState(
      state.sections,
      buildParameterUsageIndex(serializeNpcDocument(document)),
      [],
    );

    const parameterSection = state.sections.find(section => section.id === "parameters");
    expect(parameterSection).toBeDefined();

    const appearanceField = parameterSection?.fields.find(field => field.key === "Appearance");
    expect(appearanceField?.symbolRef).toEqual({
      indexKind: "registeredAssets",
      key: "ModelAsset",
    });

    const hotbarItemsField = parameterSection?.fields.find(field => field.key === "HotbarItems");
    expect(hotbarItemsField?.symbolRef).toEqual({
      indexKind: "registeredAssets",
      key: "Item",
    });
  });

  test("does not enrich a parameter when direct translations are ambiguous", () => {
    const document = createGenericDocument({
      roleAttributes: {
        Appearance: {
          Compute: "Appearance",
        },
        Model: {
          Compute: "Appearance",
        },
      },
      parameters: {
        Appearance: {
          Value: "",
        },
      },
    });

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

    const state = buildNpcPropertyState({
      document,
      topLevelKeyOrder: Object.keys(document),
      descriptors,
    });
    applyNpcPropertySectionDerivedState(
      state.sections,
      buildParameterUsageIndex(serializeNpcDocument(document)),
      [],
    );

    const parameterSection = state.sections.find(section => section.id === "parameters");
    const appearanceField = parameterSection?.fields.find(field => field.key === "Appearance");

    expect(appearanceField?.symbolRef).toBeUndefined();
  });

  test("adds a dedicated import states field for components", () => {
    const document = createComponentDocument({
      parameters: {
        _ImportStates: ["Idle"],
        AlertedRange: {
          Value: 10,
        },
      },
    });

    const state = buildNpcPropertyState({
      document,
      topLevelKeyOrder: Object.keys(document),
      descriptors: [],
    });
    applyNpcPropertySectionDerivedState(
      state.sections,
      buildParameterUsageIndex(serializeNpcDocument(document)),
      ["Alerted", "Idle", "Search"],
    );

    const parameterSection = state.sections.find(section => section.id === "parameters");
    const importStatesField = parameterSection?.fields[0];

    expect(importStatesField).toMatchObject({
      kind: "list",
      fieldPath: "Parameters._ImportStates",
      label: "Import States",
      value: {
        kind: "literal",
        value: ["Idle"],
      },
      staticSuggestions: ["Alerted", "Idle", "Search"],
    });
  });

  test("infers compute-backed role attribute field types from array descriptors and matching parameters", () => {
    const document = createGenericDocument({
      roleAttributes: {
        FlockSpawnTypes: {
          Compute: "FlockArray",
        },
        DropDeathItemsInstantly: {
          Compute: "DropDeathItemsInstantly",
        },
      },
      parameters: {
        DropDeathItemsInstantly: {
          Value: false,
        },
      },
    });

    const descriptors: NpcDescriptorDocument = [
      {
        Name: "Generic",
        Category: "Role",
        Attributes: [
          {
            Name: "FlockSpawnTypes",
            Type: "Array",
            Domain: "String",
            Computable: true,
          },
        ],
      },
    ];

    const state = buildNpcPropertyState({
      document,
      topLevelKeyOrder: Object.keys(document),
      descriptors,
    });
    const roleAttributesSection = state.sections.find(section => section.id === "roleAttributes");
    const flockSpawnTypesField = roleAttributesSection?.fields.find(
      field => field.key === "FlockSpawnTypes",
    );
    const dropDeathItemsInstantlyField = roleAttributesSection?.fields.find(
      field => field.key === "DropDeathItemsInstantly",
    );

    expect(flockSpawnTypesField).toMatchObject({
      kind: "list",
      itemType: "string",
      value: {
        kind: "compute",
        expression: "FlockArray",
      },
    });
    expect(dropDeathItemsInstantlyField).toMatchObject({
      kind: "boolean",
      value: {
        kind: "compute",
        expression: "DropDeathItemsInstantly",
      },
    });
  });

  test("treats compute-backed flag role attributes as string fields", () => {
    const document = createGenericDocument({
      roleAttributes: {
        DefaultPlayerAttitude: {
          Compute: "PlayerDefaultAttitude",
        },
      },
    });

    const descriptors: NpcDescriptorDocument = [
      {
        Name: "Generic",
        Category: "Role",
        Attributes: [
          {
            Name: "DefaultPlayerAttitude",
            Type: "Flag",
            Computable: true,
            FlagDescriptions: {
              HOSTILE: "is hostile",
              FRIENDLY: "is friendly",
            },
          },
        ],
      },
    ];

    const state = buildNpcPropertyState({
      document,
      topLevelKeyOrder: Object.keys(document),
      descriptors,
    });
    const roleAttributesSection = state.sections.find(section => section.id === "roleAttributes");
    const field = roleAttributesSection?.fields.find(
      candidate => candidate.key === "DefaultPlayerAttitude",
    );

    expect(field).toMatchObject({
      kind: "string",
      value: {
        kind: "compute",
        expression: "PlayerDefaultAttitude",
      },
    });
    expect(field?.staticSuggestions).toEqual(expect.arrayContaining(["Friendly", "Hostile"]));
  });

  test("builds and serializes variant modify overrides using immediate parent parameter fields", () => {
    const parentDocument = createVariantDocument({
      reference: "Template_Grandparent",
      parameters: {
        ParentSpeed: {
          Value: 12,
        },
      },
    });
    const parentState = buildNpcPropertyState({
      document: parentDocument,
      topLevelKeyOrder: Object.keys(parentDocument),
      descriptors: [],
    });
    const parentParameterFields =
      parentState.sections.find(section => section.id === "parameters")?.fields ?? [];

    const document = createVariantDocument({
      reference: "Template_Parent",
      modify: {
        ParentSpeed: {
          Compute: "LocalSpeed",
        },
        _CombatConfig: {
          Reference: "Balance/Passive",
        },
        _InteractionVars: {
          Greet: {
            Text: "Hello",
          },
        },
      },
      parameters: {
        LocalSpeed: {
          Value: 10,
        },
      },
    });

    const state = buildNpcPropertyState({
      document,
      topLevelKeyOrder: Object.keys(document),
      descriptors: [],
      variantReferenceParameters: parentParameterFields,
    });

    const referenceSection = state.sections.find(section => section.id === "variantReference");
    const modifySection = state.sections.find(section => section.id === "modify");

    expect(referenceSection?.fields).toMatchObject([
      {
        key: "Reference",
        fieldPath: "Reference",
        symbolRef: {
          indexKind: "registeredAssets",
          key: "NPCRole",
          filter: {
            npcRoleTypes: ["Generic", "Abstract", "Variant"],
          },
        },
      },
    ]);
    expect(modifySection?.fields).toMatchObject([
      {
        key: "ParentSpeed",
        kind: "number",
        fieldPath: "Modify.ParentSpeed",
        value: {
          kind: "compute",
          expression: "LocalSpeed",
        },
        canChangeType: false,
        computable: true,
      },
      {
        key: "_CombatConfig",
        kind: "rawJson",
      },
      {
        key: "_InteractionVars",
        kind: "rawJson",
      },
    ]);

    const serialized = serializeNpcPropertyState(state);
    expect(serialized.Modify).toEqual({
      ParentSpeed: {
        Compute: "LocalSpeed",
      },
      _CombatConfig: {
        Reference: "Balance/Passive",
      },
      _InteractionVars: {
        Greet: {
          Text: "Hello",
        },
      },
    });
    expect(Object.keys(serialized.Modify ?? {})).toEqual([
      "ParentSpeed",
      "_CombatConfig",
      "_InteractionVars",
    ]);
  });

  test("uses only the immediate parent parameters for variant modify field shaping", () => {
    const immediateParent = createVariantDocument({
      reference: "Template_Grandparent",
      parameters: {
        ImmediateOnly: {
          Value: false,
        },
      },
    });
    const immediateParentState = buildNpcPropertyState({
      document: immediateParent,
      topLevelKeyOrder: Object.keys(immediateParent),
      descriptors: [],
    });
    const immediateParentParameters =
      immediateParentState.sections.find(section => section.id === "parameters")?.fields ?? [];

    const document = createVariantDocument({
      reference: "Template_Parent",
      modify: {
        ImmediateOnly: {
          Compute: "ImmediateOnly",
        },
        GrandparentOnly: 10,
      },
    });

    const state = buildNpcPropertyState({
      document,
      topLevelKeyOrder: Object.keys(document),
      descriptors: [],
      variantReferenceParameters: immediateParentParameters,
    });

    const modifySection = state.sections.find(section => section.id === "modify");
    const immediateField = modifySection?.fields.find(field => field.key === "ImmediateOnly");
    const grandparentField = modifySection?.fields.find(field => field.key === "GrandparentOnly");

    expect(immediateField).toMatchObject({
      kind: "boolean",
      value: {
        kind: "compute",
        expression: "ImmediateOnly",
      },
    });
    expect(grandparentField).toMatchObject({
      kind: "number",
      value: {
        kind: "literal",
        value: 10,
      },
    });
  });

  test("serializes proxied section values without structuredClone errors", () => {
    const proxiedList = new Proxy(["Wolf", "Sheep"], {});
    const proxiedObject = new Proxy({ Nested: ["A", "B"] }, {});

    const serialized = serializeNpcPropertyState({
      roleType: "Generic",
      componentClass: null,
      sections: [
        {
          id: "parameters",
          name: "Parameters",
          fields: [
            {
              id: "parameter-flock-array",
              key: "FlockArray",
              label: "FlockArray",
              fieldPath: "Parameters.FlockArray.Value",
              kind: "list",
              value: {
                kind: "literal",
                value: proxiedList,
              },
              itemType: "string",
              isSet: true,
            },
          ],
          preservedFields: {
            _Extra: proxiedObject,
          },
          keyOrder: ["FlockArray", "_Extra"],
        },
      ],
      preservedTopLevelFields: {
        ExtraTopLevel: proxiedObject,
      },
      topLevelKeyOrder: ["Type", "Parameters", "ExtraTopLevel"],
    });

    expect(serialized).toEqual({
      Type: "Generic",
      Parameters: {
        FlockArray: {
          Value: ["Wolf", "Sheep"],
        },
        _Extra: {
          Nested: ["A", "B"],
        },
      },
      ExtraTopLevel: {
        Nested: ["A", "B"],
      },
    });
  });
});
