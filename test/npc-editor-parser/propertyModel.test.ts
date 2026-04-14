import { describe, expect, test } from "vitest";
import {
  addRichObjectArrayItem,
  addStateTransition,
  applyNpcPropertySectionDerivedState,
  buildNpcPropertyState,
  setRichObjectVariantType,
  serializeNpcPropertyState,
} from "../../webview/hytale-npc-role-editor/src/propertyModel";
import { buildParameterUsageIndex } from "../../webview/hytale-npc-role-editor/src/compute/parameterUsageIndex";
import type { NpcDescriptorDocument } from "../../src/shared/npc-role-editor/descriptorTypes";
import type { NpcRoleJson } from "../../webview/hytale-npc-role-editor/src/parsing/documentTypes";
import { serializeNpcDocument } from "../../webview/hytale-npc-role-editor/src/parsing/serializeNpcDocument";

function createGenericDocument({
  roleAttributes = {},
  parameters = {},
  structured = {},
}: {
  roleAttributes?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  structured?: Record<string, unknown>;
} = {}): NpcRoleJson {
  return {
    Type: "Generic",
    Parameters: parameters,
    ...structured,
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
  const componentContentDescriptors: NpcDescriptorDocument = [
    {
      Name: "Path",
      Category: "Path",
      ShortDescription: "Path content",
      Attributes: [
        {
          Name: "Waypoints",
          Type: "Array",
          Required: "REQUIRED",
          Domain: "RelativeWaypointDefinition",
          Computable: false,
        },
        {
          Name: "Scale",
          Type: "Double",
          Computable: true,
          DefaultValue: "1.0",
        },
      ],
    },
    {
      Name: "RelativeWaypointDefinition",
      Category: "RelativeWaypointDefinition",
      Attributes: [
        {
          Name: "Rotation",
          Type: "Double",
          DefaultValue: "0.0",
        },
        {
          Name: "Distance",
          Type: "Double",
          Required: "REQUIRED",
        },
      ],
    },
    {
      Name: "Timeout",
      Category: "Action",
      Attributes: [
        {
          Name: "Once",
          Type: "Boolean",
          DefaultValue: "false",
        },
        {
          Name: "Delay",
          Type: "Array",
          Domain: "Double",
          Computable: true,
          DefaultValue: "[1.0, 1.0]",
        },
        {
          Name: "Action",
          Type: "ObjectRef",
          Domain: "Action",
        },
      ],
    },
    {
      Name: "State",
      Category: "Action",
      Attributes: [
        {
          Name: "State",
          Type: "String",
          Required: "REQUIRED",
        },
      ],
    },
    {
      Name: "Sequence",
      Category: "Action",
      Attributes: [
        {
          Name: "Once",
          Type: "Boolean",
          DefaultValue: "false",
        },
        {
          Name: "Actions",
          Type: "ObjectRef",
          Domain: "ActionList",
          Required: "REQUIRED",
        },
      ],
    },
    {
      Name: "Random",
      Category: "Action",
      Attributes: [
        {
          Name: "Once",
          Type: "Boolean",
          DefaultValue: "false",
        },
        {
          Name: "Actions",
          Type: "Array",
          Domain: "WeightedAction",
          Required: "REQUIRED",
        },
      ],
    },
    {
      Name: "WeightedAction",
      Category: "WeightedAction",
      Attributes: [
        {
          Name: "Action",
          Type: "ObjectRef",
          Domain: "Action",
          Required: "REQUIRED",
        },
        {
          Name: "Weight",
          Type: "Double",
          DefaultValue: "1.0",
        },
      ],
    },
    {
      Name: "Wander",
      Category: "BodyMotion",
      Attributes: [
        {
          Name: "Radius",
          Type: "Double",
          DefaultValue: "10.0",
        },
      ],
    },
    {
      Name: "Observe",
      Category: "HeadMotion",
      Attributes: [
        {
          Name: "YawRange",
          Type: "Array",
          Domain: "Double",
          DefaultValue: "[30.0, 30.0]",
        },
      ],
    },
    {
      Name: "Walk",
      Category: "MotionController",
      Attributes: [
        {
          Name: "Type",
          Type: "String",
          Required: "REQUIRED",
        },
        {
          Name: "MaxWalkSpeed",
          Type: "Double",
          DefaultValue: "3.0",
          Computable: true,
        },
        {
          Name: "Gravity",
          Type: "Double",
          DefaultValue: "10.0",
        },
        {
          Name: "MaxFallSpeed",
          Type: "Double",
          DefaultValue: "8.0",
        },
        {
          Name: "Acceleration",
          Type: "Double",
          DefaultValue: "10.0",
        },
      ],
    },
    {
      Name: "Fly",
      Category: "MotionController",
      Attributes: [
        {
          Name: "Type",
          Type: "String",
          Required: "REQUIRED",
        },
        {
          Name: "RunThreshold",
          Type: "Double",
          DefaultValue: "0.5",
        },
      ],
    },
  ];

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

  test("builds graph content fields for instruction and sensor components", () => {
    const instructionDocument: NpcRoleJson = {
      Type: "Component",
      Class: "Instruction",
      Content: {
        Type: "Instruction",
      },
    };
    const sensorDocument: NpcRoleJson = {
      Type: "Component",
      Class: "Sensor",
      Content: {
        Type: "Time",
      },
    };

    const instructionState = buildNpcPropertyState({
      document: instructionDocument,
      topLevelKeyOrder: Object.keys(instructionDocument),
      descriptors: componentContentDescriptors,
    });
    const sensorState = buildNpcPropertyState({
      document: sensorDocument,
      topLevelKeyOrder: Object.keys(sensorDocument),
      descriptors: componentContentDescriptors,
    });

    expect(instructionState.sections.find(section => section.id === "content")?.fields[0]).toMatchObject({
      kind: "graph",
      rootType: "Instruction",
      fieldPath: "Content",
    });
    expect(sensorState.sections.find(section => section.id === "content")?.fields[0]).toMatchObject({
      kind: "graph",
      rootType: "Sensor",
      fieldPath: "Content",
    });
  });

  test("builds rich object content fields for supported component classes", () => {
    const actionDocument: NpcRoleJson = {
      Type: "Component",
      Class: "Action",
      Content: {
        Type: "Timeout",
        Delay: [2, 3],
        Action: {
          Type: "State",
          State: "Idle",
        },
      },
    };
    const actionListDocument: NpcRoleJson = {
      Type: "Component",
      Class: "ActionList",
      Content: [
        {
          Type: "Timeout",
          Delay: [1, 1],
        },
      ],
    };
    const bodyMotionDocument: NpcRoleJson = {
      Type: "Component",
      Class: "BodyMotion",
      Content: {
        Type: "Wander",
        Radius: 5,
      },
    };
    const pathDocument: NpcRoleJson = {
      Type: "Component",
      Class: "Path",
      Content: {
        Scale: {
          Compute: "Scale",
        },
        Waypoints: [
          {
            Distance: 5,
          },
        ],
      },
      Parameters: {
        Scale: {
          Value: 1,
        },
      },
    };

    const actionState = buildNpcPropertyState({
      document: actionDocument,
      topLevelKeyOrder: Object.keys(actionDocument),
      descriptors: componentContentDescriptors,
    });
    const actionField = actionState.sections.find(section => section.id === "content")?.fields[0];
    expect(actionField).toMatchObject({
      kind: "richObject",
      shapeKey: "Action",
      structureKind: "object",
      variantType: "Timeout",
    });
    expect(actionField?.childFields?.find(field => field.key === "Action")).toMatchObject({
      kind: "richObject",
      label: "Inline Action",
      shapeKey: "Action",
    });
    expect(serializeNpcPropertyState(actionState)).toEqual(actionDocument);

    const actionListState = buildNpcPropertyState({
      document: actionListDocument,
      topLevelKeyOrder: Object.keys(actionListDocument),
      descriptors: componentContentDescriptors,
    });
    expect(actionListState.sections.find(section => section.id === "content")?.fields[0]).toMatchObject({
      kind: "richObject",
      shapeKey: "ActionList",
      structureKind: "array",
      itemShapeKey: "Action",
    });
    expect(serializeNpcPropertyState(actionListState)).toEqual(actionListDocument);

    const bodyMotionState = buildNpcPropertyState({
      document: bodyMotionDocument,
      topLevelKeyOrder: Object.keys(bodyMotionDocument),
      descriptors: componentContentDescriptors,
    });
    expect(bodyMotionState.sections.find(section => section.id === "content")?.fields[0]).toMatchObject({
      kind: "richObject",
      shapeKey: "BodyMotion",
      structureKind: "object",
      variantType: "Wander",
    });
    expect(serializeNpcPropertyState(bodyMotionState)).toEqual(bodyMotionDocument);

    const pathState = buildNpcPropertyState({
      document: pathDocument,
      topLevelKeyOrder: Object.keys(pathDocument),
      descriptors: componentContentDescriptors,
    });
    const pathField = pathState.sections.find(section => section.id === "content")?.fields[0];
    expect(pathField).toMatchObject({
      kind: "richObject",
      shapeKey: "Path",
      structureKind: "object",
    });
    expect(pathField?.childFields?.find(field => field.key === "Waypoints")).toMatchObject({
      kind: "richObject",
      structureKind: "array",
      itemShapeKey: "RelativeWaypointDefinition",
    });
    expect(pathField?.childFields?.find(field => field.key === "Scale")).toMatchObject({
      kind: "number",
      value: {
        kind: "compute",
        expression: "Scale",
      },
    });
    expect(serializeNpcPropertyState(pathState)).toEqual(pathDocument);
  });

  test("falls back to raw json content for unknown component classes and wrapper content", () => {
    const unknownDocument: NpcRoleJson = {
      Type: "Component",
      Class: "UnknownThing",
      Content: {
        Anything: true,
      },
    };
    const wrappedDocument: NpcRoleJson = {
      Type: "Component",
      Class: "Action",
      Content: {
        Reference: "Component_ActionList_Sleep",
        Modify: {
          Extra: true,
        },
      },
    };

    const unknownState = buildNpcPropertyState({
      document: unknownDocument,
      topLevelKeyOrder: Object.keys(unknownDocument),
      descriptors: componentContentDescriptors,
    });
    const wrappedState = buildNpcPropertyState({
      document: wrappedDocument,
      topLevelKeyOrder: Object.keys(wrappedDocument),
      descriptors: componentContentDescriptors,
    });

    expect(unknownState.sections.find(section => section.id === "content")?.fields[0]?.kind).toBe("rawJson");
    expect(wrappedState.sections.find(section => section.id === "content")?.fields[0]?.kind).toBe("rawJson");
    expect(serializeNpcPropertyState(wrappedState)).toEqual(wrappedDocument);
  });

  test("does not emit a role attributes section for components", () => {
    const document = createComponentDocument({
      componentClass: "Path",
      parameters: {
        _ImportStates: ["Idle"],
      },
    });

    const state = buildNpcPropertyState({
      document,
      topLevelKeyOrder: Object.keys(document),
      descriptors: componentContentDescriptors,
    });

    expect(state.sections.some(section => section.id === "roleAttributes")).toBe(false);
  });

  test("seeds structured defaults for sequence and random action type changes", () => {
    const document: NpcRoleJson = {
      Type: "Component",
      Class: "Action",
    };

    const state = buildNpcPropertyState({
      document,
      topLevelKeyOrder: Object.keys(document),
      descriptors: componentContentDescriptors,
    });
    const field = state.sections.find(section => section.id === "content")?.fields[0];
    expect(field).toBeDefined();

    expect(setRichObjectVariantType(field!, "Sequence", componentContentDescriptors)).toBe(true);
    expect(field).toMatchObject({
      variantType: "Sequence",
    });
    expect(field?.childFields?.find(childField => childField.key === "Actions")).toMatchObject({
      kind: "richObject",
      structureKind: "array",
      isSet: true,
    });

    expect(setRichObjectVariantType(field!, "Random", componentContentDescriptors)).toBe(true);
    const actionsField = field?.childFields?.find(childField => childField.key === "Actions");
    expect(actionsField).toMatchObject({
      kind: "richObject",
      structureKind: "array",
      itemShapeKey: "WeightedAction",
    });
    const weightedActionItem = actionsField?.childFields?.[0];
    expect(weightedActionItem).toBeDefined();
    expect(weightedActionItem?.childFields?.find(childField => childField.key === "Weight")).toMatchObject({
      value: {
        kind: "literal",
        value: 1,
      },
    });
    const inlineActionField = weightedActionItem?.childFields?.find(
      childField => childField.key === "Action",
    );
    expect(inlineActionField).toMatchObject({
      kind: "richObject",
      variantType: "State",
      isSet: true,
    });
    expect(inlineActionField?.childFields?.find(childField => childField.key === "State")).toMatchObject({
      value: {
        kind: "literal",
        value: "Idle",
      },
    });
  });

  test("builds generic structured top-level sections even when unset", () => {
    const document = createGenericDocument({
      roleAttributes: {
        Appearance: "NPCs/Test",
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
          },
        ],
      },
    ];

    const state = buildNpcPropertyState({
      document,
      topLevelKeyOrder: Object.keys(document),
      descriptors,
    });

    expect(state.sections.map(section => section.id)).toEqual([
      "parameters",
      "interactionInstruction",
      "deathInstruction",
      "stateTransitions",
      "motionControllerList",
      "roleAttributes",
    ]);

    expect(state.sections.find(section => section.id === "interactionInstruction")?.fields[0]).toMatchObject({
      kind: "graph",
      fieldPath: "InteractionInstruction",
      isSet: false,
    });
    expect(state.sections.find(section => section.id === "deathInstruction")?.fields[0]).toMatchObject({
      kind: "graph",
      fieldPath: "DeathInstruction",
      isSet: false,
    });
    expect(state.sections.find(section => section.id === "stateTransitions")?.fields[0]).toMatchObject({
      kind: "stateTransitions",
      fieldPath: "StateTransitions",
      isSet: false,
    });
    expect(state.sections.find(section => section.id === "motionControllerList")?.fields[0]).toMatchObject({
      kind: "richObject",
      structureKind: "array",
      itemShapeKey: "MotionController",
      fieldPath: "MotionControllerList",
      isSet: false,
    });

    const serialized = serializeNpcPropertyState(state);
    expect(serialized).toEqual({
      Type: "Generic",
      Appearance: "NPCs/Test",
    });
  });

  test("builds the same structured top-level sections for abstract roles", () => {
    const document: NpcRoleJson = {
      Type: "Abstract",
      Parameters: {},
    };

    const state = buildNpcPropertyState({
      document,
      topLevelKeyOrder: Object.keys(document),
      descriptors: [],
    });

    expect(state.sections.map(section => section.id)).toEqual([
      "parameters",
      "interactionInstruction",
      "deathInstruction",
      "stateTransitions",
      "motionControllerList",
    ]);
    expect(serializeNpcPropertyState(state)).toEqual({
      Type: "Abstract",
    });
  });

  test("round-trips motion controller lists as structured richObject arrays", () => {
    const document = createGenericDocument({
      structured: {
        MotionControllerList: [
          {
            Type: "Walk",
            MaxWalkSpeed: {
              Compute: "WalkSpeed",
            },
            Gravity: 10,
            MaxFallSpeed: 8,
            Acceleration: 10,
          },
        ],
      },
      parameters: {
        WalkSpeed: {
          Value: 3,
        },
      },
    });

    const state = buildNpcPropertyState({
      document,
      topLevelKeyOrder: Object.keys(document),
      descriptors: componentContentDescriptors,
    });
    const motionControllersField = state.sections.find(
      section => section.id === "motionControllerList",
    )?.fields[0];

    expect(motionControllersField).toMatchObject({
      kind: "richObject",
      structureKind: "array",
      itemShapeKey: "MotionController",
      isSet: true,
    });
    expect(motionControllersField?.childFields?.[0]).toMatchObject({
      variantType: "Walk",
      label: "Walk 1",
    });

    const serialized = serializeNpcPropertyState(state);
    expect(serialized.MotionControllerList).toEqual(document.MotionControllerList);
  });

  test("seeds walk as the default motion controller when adding the first controller", () => {
    const document = createGenericDocument();

    const state = buildNpcPropertyState({
      document,
      topLevelKeyOrder: Object.keys(document),
      descriptors: componentContentDescriptors,
    });
    const field = state.sections.find(section => section.id === "motionControllerList")?.fields[0];

    expect(field).toBeDefined();
    expect(addRichObjectArrayItem(field!, componentContentDescriptors)).toBe(true);

    expect(field?.childFields?.[0]).toMatchObject({
      variantType: "Walk",
      label: "Walk 1",
    });
    expect(serializeNpcPropertyState(state).MotionControllerList).toEqual([
      {
        Type: "Walk",
        MaxWalkSpeed: 3,
        Gravity: 10,
        MaxFallSpeed: 8,
        Acceleration: 10,
      },
    ]);
  });

  test("round-trips custom state transitions with nested action lists", () => {
    const document = createGenericDocument({
      structured: {
        StateTransitions: [
          {
            $Comment: "Alert transition",
            Enabled: {
              Compute: "CanAlert",
            },
            States: [
              {
                From: ["Idle"],
                To: ["Alerted"],
                Priority: 2,
                Enabled: true,
              },
              {
                From: ["Search"],
                To: ["Idle"],
              },
            ],
            Actions: [
              {
                Type: "Timeout",
                Delay: [1, 1],
              },
            ],
            UnknownKey: "keep-me",
          },
        ],
      },
      parameters: {
        CanAlert: {
          Value: true,
        },
      },
    });

    const state = buildNpcPropertyState({
      document,
      topLevelKeyOrder: Object.keys(document),
      descriptors: componentContentDescriptors,
    });
    const field = state.sections.find(section => section.id === "stateTransitions")?.fields[0];

    expect(field).toMatchObject({
      kind: "stateTransitions",
      isSet: true,
    });
    expect(field?.transitions?.[0]).toMatchObject({
      comment: "Alert transition",
      enabled: {
        kind: "compute",
        expression: "CanAlert",
      },
      preservedData: {
        UnknownKey: "keep-me",
      },
    });
    expect(field?.transitions?.[0]?.edges).toMatchObject([
      {
        from: ["Idle"],
        to: ["Alerted"],
        priority: 2,
        enabled: {
          kind: "literal",
          value: true,
        },
      },
      {
        from: ["Search"],
        to: ["Idle"],
      },
    ]);
    expect(field?.transitions?.[0]?.actionsField).toMatchObject({
      kind: "richObject",
      structureKind: "array",
      itemShapeKey: "Action",
    });

    const serialized = serializeNpcPropertyState(state);
    expect(serialized.StateTransitions).toEqual(document.StateTransitions);
  });

  test("adds default state transitions through the custom field kind", () => {
    const document = createGenericDocument();

    const state = buildNpcPropertyState({
      document,
      topLevelKeyOrder: Object.keys(document),
      descriptors: componentContentDescriptors,
    });
    const field = state.sections.find(section => section.id === "stateTransitions")?.fields[0];

    expect(field).toBeDefined();
    expect(addStateTransition(field!, componentContentDescriptors)).toBe(true);
    expect(field?.transitions).toHaveLength(1);
    expect(field?.transitions?.[0]?.edges).toEqual([
      {
        id: "state-transition-edge-0",
        from: [],
        to: [],
      },
    ]);
    expect(serializeNpcPropertyState(state).StateTransitions).toEqual([
      {
        States: [
          {
            From: [],
            To: [],
          },
        ],
        Actions: [],
      },
    ]);
  });
});
