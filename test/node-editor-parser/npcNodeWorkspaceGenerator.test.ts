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
        SymbolLookup: {
          indexKind: "registeredAssets",
          key: "Item",
        },
        Width: 240,
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

  test("buildContentField marks only empty-valid string fields as explicit-empty capable", () => {
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
      Options: {
        AllowExplicitEmpty: true,
      },
    });
    expect(buildContentField(actionDisplayNameDescriptor, displayNameAttribute)).toMatchObject({
      Options: {
        AllowExplicitEmpty: true,
      },
    });
    expect(buildContentField(actionSetInteractableDescriptor, hintAttribute)).toMatchObject({
      Options: {
        AllowExplicitEmpty: true,
      },
    });
    expect(buildContentField(actionNotifyDescriptor, messageAttribute)?.Options).not.toHaveProperty(
      "AllowExplicitEmpty",
    );
    expect(buildContentField(actionAppearanceDescriptor, appearanceAttribute)?.Options).not.toHaveProperty(
      "AllowExplicitEmpty",
    );
  });
});
