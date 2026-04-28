import { describe, expect, test } from "vitest";

import { buildContentField } from "../../scripts/lib/npc-node-workspace/buildNpcFieldSchema";
import { resolveChildSpec } from "../../scripts/lib/npc-node-workspace/buildNpcChildSchema";
import { parseNpcDescriptors } from "../../scripts/lib/npc-node-workspace/loadNpcDescriptors";
import { buildNpcWorkspaceArtifacts } from "../../scripts/lib/npc-node-workspace/buildNpcWorkspaceManifest";

function findDescriptorOrThrow(category: string, name: string) {
  const descriptor = parseNpcDescriptors().find(
    entry => entry.Category === category && entry.Name === name,
  );
  if (!descriptor) {
    throw new Error(`Descriptor ${category}:${name} was not found.`);
  }
  return descriptor;
}

function findTemplateOrThrow(
  artifacts: ReturnType<typeof buildNpcWorkspaceArtifacts>,
  templateId: string,
) {
  const template = artifacts.templateOutputs.find(output => output.template.Id === templateId)
    ?.template;
  if (!template) {
    throw new Error(`Template ${templateId} was not found.`);
  }
  return template;
}

describe("NPC node workspace generator builders", () => {
  test("buildContentField infers enum/computable metadata from real descriptors", () => {
    const bodyMotionPathDescriptor = findDescriptorOrThrow("BodyMotion", "Path");
    const attribute = bodyMotionPathDescriptor.Attributes?.find(entry => entry.Name === "Shape");
    if (!attribute) {
      throw new Error("Attribute Shape was not found.");
    }

    expect(buildContentField(bodyMotionPathDescriptor, attribute)).toMatchObject({
      Id: "Shape",
      Type: "Enum",
      Options: {
        Label: "Shape",
        Computable: true,
        Width: 220,
        Values: ["LINE", "LOOP", "POINTS", "CHAIN"],
      },
    });
  });

  test("resolveChildSpec preserves action-list reference-capable semantics", () => {
    const instructionDescriptor = findDescriptorOrThrow("Instruction", "Instruction");
    const attribute = instructionDescriptor.Attributes?.find(entry => entry.Name === "Actions");
    if (!attribute) {
      throw new Error("Attribute Actions was not found.");
    }

    expect(
      resolveChildSpec(
        {
          Category: "Structural",
          Name: "Instruction",
        },
        attribute,
      ),
    ).toMatchObject({
      childId: "ActionVariants",
      connectionType: "ActionListItem",
      multiplicity: "multiple",
      allowComponentReferences: true,
    });
  });

  test("buildNpcWorkspaceArtifacts exposes expected roots and reference templates before file emission", () => {
    const artifacts = buildNpcWorkspaceArtifacts(parseNpcDescriptors());

    expect(artifacts.workspaceDefinition.Roots).toMatchObject({
      Instructions: {
        RootNodeType: "Structural.InstructionListRoot",
      },
      Action: {
        RootNodeType: "ActionContentVariants",
      },
      ActionList: {
        RootNodeType: "Structural.ActionListRoot",
      },
      BodyMotion: {
        RootNodeType: "BodyMotionVariants",
      },
      HeadMotion: {
        RootNodeType: "HeadMotionVariants",
      },
      Instruction: {
        RootNodeType: "InstructionVariants",
      },
      Path: {
        RootNodeType: "Path.Path",
      },
      Sensor: {
        RootNodeType: "SensorVariants",
      },
    });

    expect(artifacts.workspaceDefinition.Variants?.InstructionVariants).toMatchObject({
      VariantFieldName: "Type",
      DefaultTemplateId: "Structural.InstructionNode",
      Variants: {
        Random: "Structural.RandomInstructionNode",
      },
    });
    expect(artifacts.workspaceDefinition.Variants?.ActionContentVariants?.Variants).toMatchObject({
      ActionReference: "Action.ActionReference",
      Nothing: "Action.Nothing",
    });
    expect(
      artifacts.workspaceDefinition.Variants?.ActionContentVariants?.Variants,
    ).not.toHaveProperty("ActionListReference");

    const templateIds = new Set(artifacts.templateOutputs.map(output => output.template.Id));
    expect(templateIds.has("Structural.ActionListRoot")).toBe(true);
    expect(templateIds.has("Structural.InstructionReference")).toBe(true);
    expect(templateIds.has("Structural.RandomInstructionNode")).toBe(true);
    expect(templateIds.has("Structural.WeightedInstruction")).toBe(true);
    expect(templateIds.has("Action.ActionReference")).toBe(true);
    expect(templateIds.has("Action.ActionListReference")).toBe(true);
    expect(templateIds.has("Path.Reference")).toBe(true);

    expect(
      artifacts.templateOutputs.find(output => output.template.Id === "Action.Random")?.template.Title,
    ).toBe("Action: Random");
    expect(
      artifacts.templateOutputs.find(output => output.template.Id === "Sensor.Random")?.template.Title,
    ).toBe("Sensor: Random");
    expect(
      artifacts.templateOutputs.find(output => output.template.Id === "Structural.InstructionNode")
        ?.template.Title,
    ).toBe("Instruction");
    expect(
      artifacts.templateOutputs.find(output => output.template.Id === "Structural.RandomInstructionNode")
        ?.template.Title,
    ).toBe("Random Instruction");
    expect(
      artifacts.templateOutputs.find(output => output.template.Id === "Structural.WeightedInstruction")
        ?.template.Title,
    ).toBe("Weighted Instruction");

    expect(
      artifacts.templateOutputs.find(output => output.template.Id === "Structural.ActionListRoot")
        ?.template.Schema,
    ).toMatchObject({
      Actions: {
        Node: "ActionContentVariants",
        SerializationType: "root",
        AllowComponentReferences: true,
        ComponentReferenceSlotOccupancy: "normal-item",
      },
    });
  });

  test("buildNpcWorkspaceArtifacts emits user-facing NPC pin labels", () => {
    const artifacts = buildNpcWorkspaceArtifacts(parseNpcDescriptors());

    const sensorNot = findTemplateOrThrow(artifacts, "Sensor.Not");
    expect(sensorNot.Outputs?.find(pin => pin.Id === "Output")).toMatchObject({
      Type: "PositionSensor",
      Label: "For",
    });
    expect(sensorNot.Inputs?.find(pin => pin.Id === "SensorPin")).toMatchObject({
      Type: "Sensor",
      Label: "Sensor",
    });

    const filterNot = findTemplateOrThrow(artifacts, "IEntityFilter.Not");
    expect(filterNot.Outputs?.find(pin => pin.Id === "Output")).toMatchObject({
      Type: "IEntityFilter",
      Label: "For",
    });
    expect(filterNot.Inputs?.find(pin => pin.Id === "FilterPin")).toMatchObject({
      Type: "IEntityFilter",
      Label: "Filter",
    });

    const timeout = findTemplateOrThrow(artifacts, "Action.Timeout");
    expect(timeout.Inputs?.find(pin => pin.Id === "Input")).toMatchObject({
      Type: "ActionListItem",
      Label: "Parent",
    });
    expect(timeout.Outputs?.find(pin => pin.Id === "ActionPin")).toMatchObject({
      Type: "Action",
      Label: "Action",
    });

    const makePath = findTemplateOrThrow(artifacts, "Action.MakePath");
    expect(makePath.Inputs?.find(pin => pin.Id === "Input")).toMatchObject({
      Type: "ActionListItem",
      Label: "Parent",
    });
    expect(makePath.Outputs?.find(pin => pin.Id === "PathPin")).toMatchObject({
      Type: "Path",
      Label: "Path",
    });

    const instruction = findTemplateOrThrow(artifacts, "Structural.InstructionNode");
    expect(instruction.Inputs?.find(pin => pin.Id === "Input")).toMatchObject({
      Type: "Instruction",
      Label: "Parent",
    });
    expect(instruction.Inputs?.find(pin => pin.Id === "SensorPin")).toMatchObject({
      Type: "Sensor",
      Label: "Sensor",
    });
    expect(instruction.Outputs?.find(pin => pin.Id === "InstructionsPin")).toMatchObject({
      Type: "Instruction",
      Label: "Instructions",
    });

    const bodyMotionTimer = findTemplateOrThrow(artifacts, "BodyMotion.Timer");
    expect(bodyMotionTimer.Outputs?.find(pin => pin.Id === "MotionPin")).toMatchObject({
      Type: "BodyMotion",
      Label: "Motion",
    });
    expect(instruction.Outputs?.find(pin => pin.Id === "BodyMotionPin")).toMatchObject({
      Type: "BodyMotion",
      Label: "Body Motion",
    });
    expect(instruction.Outputs?.find(pin => pin.Id === "HeadMotionPin")).toMatchObject({
      Type: "HeadMotion",
      Label: "Head Motion",
    });

    const valueProviderWrapper = findTemplateOrThrow(artifacts, "Sensor.ValueProviderWrapper");
    expect(valueProviderWrapper.Inputs?.find(pin => pin.Id === "ValueToParameterMappingsPin"))
      .toMatchObject({
        Type: "ValueToParameterMapping",
        Label: "Parameter Mappings",
      });
  });

  test("buildContentField annotates state autocomplete metadata for NPC node fields", () => {
    const actionStateDescriptor = findDescriptorOrThrow("Action", "State");
    const stateAttribute = actionStateDescriptor.Attributes?.find(entry => entry.Name === "State");
    if (!stateAttribute) {
      throw new Error("Attribute State was not found.");
    }

    expect(buildContentField(actionStateDescriptor, stateAttribute)).toMatchObject({
      Id: "State",
      Options: {
        StateAutocompleteKind: "role-full",
      },
    });
  });

  test("buildContentField annotates appearance-model animation autocomplete metadata for NPC node fields", () => {
    const actionDescriptor = findDescriptorOrThrow("Action", "PlayAnimation");
    const animationAttribute = actionDescriptor.Attributes?.find(entry => entry.Name === "Animation");
    if (!animationAttribute) {
      throw new Error("Attribute Animation was not found.");
    }

    expect(buildContentField(actionDescriptor, animationAttribute)).toMatchObject({
      Id: "Animation",
      Options: {
        AnimationAutocompleteKind: "appearance-model",
      },
    });
  });

  test("buildContentField includes asset-backed action fields instead of dropping them", () => {
    const actionAppearanceDescriptor = findDescriptorOrThrow("Action", "Appearance");
    const appearanceAttribute = actionAppearanceDescriptor.Attributes?.find(
      entry => entry.Name === "Appearance",
    );
    if (!appearanceAttribute) {
      throw new Error("Attribute Appearance was not found.");
    }

    expect(buildContentField(actionAppearanceDescriptor, appearanceAttribute)).toMatchObject({
      Id: "Appearance",
      Type: "SmallString",
      Options: {
        Label: "Appearance",
        SymbolLookup: {
          indexKind: "registeredAssets",
          key: "ModelAsset",
        },
        Width: 220,
      },
    });
  });

  test("buildContentField includes asset-array fields instead of dropping them", () => {
    const sensorDroppedItemDescriptor = findDescriptorOrThrow("Sensor", "DroppedItem");
    const itemsAttribute = sensorDroppedItemDescriptor.Attributes?.find(entry => entry.Name === "Items");
    if (!itemsAttribute) {
      throw new Error("Attribute Items was not found.");
    }

    expect(buildContentField(sensorDroppedItemDescriptor, itemsAttribute)).toMatchObject({
      Id: "Items",
      Type: "List",
      Options: {
        Label: "Items",
        Type: "String",
        SymbolLookup: {
          indexKind: "registeredAssets",
          key: "Item",
        },
        Width: 240,
      },
    });
  });

  test("buildContentField emits list fields for flag and string list descriptor types", () => {
    const actionTestDescriptor = findDescriptorOrThrow("Action", "Test");
    const enumSetAttribute = actionTestDescriptor.Attributes?.find(entry => entry.Name === "EnumSet");
    if (!enumSetAttribute) {
      throw new Error("Attribute EnumSet was not found.");
    }

    const prioritiserAttitudeDescriptor = findDescriptorOrThrow(
      "ISensorEntityPrioritiser",
      "Attitude",
    );
    const attitudesByPriorityAttribute = prioritiserAttitudeDescriptor.Attributes?.find(
      entry => entry.Name === "AttitudesByPriority",
    );
    if (!attitudesByPriorityAttribute) {
      throw new Error("Attribute AttitudesByPriority was not found.");
    }

    const stateTransitionEdgesDescriptor = findDescriptorOrThrow(
      "StateTransitionEdges",
      "StateTransitionEdges",
    );
    const fromAttribute = stateTransitionEdgesDescriptor.Attributes?.find(entry => entry.Name === "From");
    if (!fromAttribute) {
      throw new Error("Attribute From was not found.");
    }

    expect(buildContentField(actionTestDescriptor, enumSetAttribute)).toMatchObject({
      Id: "EnumSet",
      Type: "List",
      Options: {
        Label: "EnumSet",
        Type: "String",
        Default: ["Flock", "Collisions"],
        UniqueItems: true,
        Values: expect.arrayContaining(["Flock", "Collisions"]),
      },
    });
    expect(buildContentField(prioritiserAttitudeDescriptor, attitudesByPriorityAttribute)).toMatchObject({
      Id: "AttitudesByPriority",
      Type: "List",
      Options: {
        Label: "AttitudesByPriority",
        Type: "String",
        UniqueItems: true,
        Values: ["IGNORE", "HOSTILE", "NEUTRAL", "FRIENDLY", "REVERED"],
      },
    });
    expect(buildContentField(stateTransitionEdgesDescriptor, fromAttribute)).toMatchObject({
      Id: "From",
      Type: "List",
      Options: {
        Label: "From",
        Type: "String",
      },
    });
    expect(buildContentField(stateTransitionEdgesDescriptor, fromAttribute)?.Options).not.toHaveProperty(
      "UniqueItems",
    );
  });

  test("buildContentField emits tuple fields for fixed-size descriptor arrays", () => {
    const randomInstructionDescriptor = findDescriptorOrThrow("Instruction", "Random");
    const executeForAttribute = randomInstructionDescriptor.Attributes?.find(
      entry => entry.Name === "ExecuteFor",
    );
    if (!executeForAttribute) {
      throw new Error("Attribute ExecuteFor was not found.");
    }

    const actionSpawnDescriptor = findDescriptorOrThrow("Action", "Spawn");
    const countRangeAttribute = actionSpawnDescriptor.Attributes?.find(
      entry => entry.Name === "CountRange",
    );
    if (!countRangeAttribute) {
      throw new Error("Attribute CountRange was not found.");
    }

    const actionSetAlarmDescriptor = findDescriptorOrThrow("Action", "SetAlarm");
    const durationRangeAttribute = actionSetAlarmDescriptor.Attributes?.find(
      entry => entry.Name === "DurationRange",
    );
    if (!durationRangeAttribute) {
      throw new Error("Attribute DurationRange was not found.");
    }

    const actionSpawnParticlesDescriptor = findDescriptorOrThrow("Action", "SpawnParticles");
    const offsetAttribute = actionSpawnParticlesDescriptor.Attributes?.find(
      entry => entry.Name === "Offset",
    );
    if (!offsetAttribute) {
      throw new Error("Attribute Offset was not found.");
    }

    const altitudeFilterDescriptor = findDescriptorOrThrow("IEntityFilter", "Altitude");
    const altitudeRangeAttribute = altitudeFilterDescriptor.Attributes?.find(
      entry => entry.Name === "AltitudeRange",
    );
    if (!altitudeRangeAttribute) {
      throw new Error("Attribute AltitudeRange was not found.");
    }

    const actionTestDescriptor = findDescriptorOrThrow("Action", "Test");
    const doubleArrayAttribute = actionTestDescriptor.Attributes?.find(
      entry => entry.Name === "DoubleArray",
    );
    if (!doubleArrayAttribute) {
      throw new Error("Attribute DoubleArray was not found.");
    }

    expect(buildContentField(randomInstructionDescriptor, executeForAttribute)).toMatchObject({
      Id: "ExecuteFor",
      Type: "Tuple",
      Options: {
        TupleSize: 2,
        TupleItemType: "Float",
        Computable: true,
        Default: [Number.MAX_VALUE, Number.MAX_VALUE],
      },
    });
    expect(buildContentField(actionSpawnDescriptor, countRangeAttribute)).toMatchObject({
      Id: "CountRange",
      Type: "Tuple",
      Options: {
        TupleSize: 2,
        TupleItemType: "Int",
      },
    });
    expect(buildContentField(actionSetAlarmDescriptor, durationRangeAttribute)).toMatchObject({
      Id: "DurationRange",
      Type: "Tuple",
      Options: {
        TupleSize: 2,
        TupleItemType: "String",
      },
    });
    expect(buildContentField(actionSpawnParticlesDescriptor, offsetAttribute)).toMatchObject({
      Id: "Offset",
      Type: "Tuple",
      Options: {
        TupleSize: 3,
        TupleItemType: "Float",
      },
    });
    expect(buildContentField(altitudeFilterDescriptor, altitudeRangeAttribute)).toMatchObject({
      Id: "AltitudeRange",
      Type: "List",
      Options: {
        Type: "Float",
      },
    });
    expect(buildContentField(actionTestDescriptor, doubleArrayAttribute)).toMatchObject({
      Id: "DoubleArray",
      Type: "List",
      Options: {
        Type: "Float",
      },
    });
  });

  test("buildContentField emits symbol lookups for non-obvious NPC descriptor domains", () => {
    const sensorCountDescriptor = findDescriptorOrThrow("Sensor", "Count");
    const includeGroupsAttribute = sensorCountDescriptor.Attributes?.find(
      entry => entry.Name === "IncludeGroups",
    );
    if (!includeGroupsAttribute) {
      throw new Error("Attribute IncludeGroups was not found.");
    }

    const actionAttackDescriptor = findDescriptorOrThrow("Action", "Attack");
    const attackAttribute = actionAttackDescriptor.Attributes?.find(entry => entry.Name === "Attack");
    if (!attackAttribute) {
      throw new Error("Attribute Attack was not found.");
    }

    expect(buildContentField(sensorCountDescriptor, includeGroupsAttribute)).toMatchObject({
      Id: "IncludeGroups",
      Options: {
        SymbolLookup: {
          indexKind: "registeredAssets",
          key: "NPCGroup",
        },
      },
    });

    expect(buildContentField(actionAttackDescriptor, attackAttribute)).toMatchObject({
      Id: "Attack",
      Options: {
        SymbolLookup: {
          indexKind: "registeredAssets",
          key: "RootInteraction",
        },
      },
    });
  });

  test("buildContentField treats descriptor strings as plain string fields", () => {
    const actionModelAttachmentDescriptor = findDescriptorOrThrow("Action", "ModelAttachment");
    const attachmentAttribute = actionModelAttachmentDescriptor.Attributes?.find(
      entry => entry.Name === "Attachment",
    );
    if (!attachmentAttribute) {
      throw new Error("Attribute Attachment was not found.");
    }

    const actionDisplayNameDescriptor = findDescriptorOrThrow("Action", "DisplayName");
    const displayNameAttribute = actionDisplayNameDescriptor.Attributes?.find(
      entry => entry.Name === "DisplayName",
    );
    if (!displayNameAttribute) {
      throw new Error("Attribute DisplayName was not found.");
    }

    const actionSetInteractableDescriptor = findDescriptorOrThrow("Action", "SetInteractable");
    const hintAttribute = actionSetInteractableDescriptor.Attributes?.find(
      entry => entry.Name === "Hint",
    );
    if (!hintAttribute) {
      throw new Error("Attribute Hint was not found.");
    }

    const actionNotifyDescriptor = findDescriptorOrThrow("Action", "Notify");
    const messageAttribute = actionNotifyDescriptor.Attributes?.find(entry => entry.Name === "Message");
    if (!messageAttribute) {
      throw new Error("Attribute Message was not found.");
    }

    const actionAppearanceDescriptor = findDescriptorOrThrow("Action", "Appearance");
    const appearanceAttribute = actionAppearanceDescriptor.Attributes?.find(
      entry => entry.Name === "Appearance",
    );
    if (!appearanceAttribute) {
      throw new Error("Attribute Appearance was not found.");
    }

    expect(buildContentField(actionModelAttachmentDescriptor, attachmentAttribute)).toMatchObject({
      Type: "SmallString",
    });
    expect(buildContentField(actionDisplayNameDescriptor, displayNameAttribute)).toMatchObject({
      Type: "SmallString",
    });
    expect(buildContentField(actionSetInteractableDescriptor, hintAttribute)).toMatchObject({
      Type: "SmallString",
    });
    expect(buildContentField(actionNotifyDescriptor, messageAttribute)).toMatchObject({
      Type: "SmallString",
    });
    expect(buildContentField(actionAppearanceDescriptor, appearanceAttribute)).toMatchObject({
      Type: "SmallString",
    });
  });

  test("buildContentField treats descriptor string lists as plain list fields", () => {
    const genericDescriptor = findDescriptorOrThrow("Role", "Generic");
    const displayNamesAttribute = genericDescriptor.Attributes?.find(entry => entry.Name === "DisplayNames");
    const busyStatesAttribute = genericDescriptor.Attributes?.find(entry => entry.Name === "BusyStates");
    if (!displayNamesAttribute || !busyStatesAttribute) {
      throw new Error("Expected Generic role list attributes were not found.");
    }

    expect(buildContentField(genericDescriptor, displayNamesAttribute)).toMatchObject({
      Type: "List",
    });
    expect(buildContentField(genericDescriptor, busyStatesAttribute)).toMatchObject({
      Type: "List",
    });
    expect(
      buildContentField(genericDescriptor, {
        ...busyStatesAttribute,
        Validator: {
          Type: "StateString",
          StateParts: null,
          AllowEmptyMain: true,
          MainStateOnly: false,
          AllowNull: false,
        },
      }),
    ).toMatchObject({
      Type: "List",
    });
  });
});
