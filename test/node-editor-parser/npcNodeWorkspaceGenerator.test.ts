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
      Instruction: {
        RootNodeType: "Structural.InstructionNode",
      },
      Sensor: {
        RootNodeType: "SensorVariants",
      },
    });

    const templateIds = new Set(artifacts.templateOutputs.map(output => output.template.Id));
    expect(templateIds.has("Structural.InstructionReference")).toBe(true);
    expect(templateIds.has("Action.ActionReference")).toBe(true);
    expect(templateIds.has("Action.ActionListReference")).toBe(true);
    expect(templateIds.has("Path.Reference")).toBe(true);
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
});
