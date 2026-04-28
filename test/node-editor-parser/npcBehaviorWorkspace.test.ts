import path from "node:path";
import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { WorkspaceRuntime } from "../../src/node-editor/workspaceResolver";
import { SchemaRuntime } from "../../src/schema/schemaLoader";
import type { NpcDescriptorDocument } from "../../src/shared/npc-role-editor/descriptorTypes";
import type { NpcGraphTargetWorkspaceRoot } from "../../src/shared/npc-role-editor/graphTargets";
import type { NodeEditorWorkspaceContext } from "../../src/shared/node-editor/workspaceTypes";
import { getCreatableRootTemplates } from "../../src/shared/node-editor/rootCompatibility";
import {
  adaptGraphDocumentRootToHostValue,
  adaptGraphHostValueToDocumentRoot,
} from "../../src/shared/npc-role-editor/graphRootAdapter";
import {
  NPC_BEHAVIOR_CONNECTION_TYPES_FOR_WORKSPACE,
  NPC_BEHAVIOR_CHILD_DOMAIN_DEFINITIONS,
  NPC_BEHAVIOR_CONNECTION_DEFINITIONS,
  NPC_BEHAVIOR_REFERENCE_DARK_COLORS,
  getNpcBehaviorCategoryColor,
  getNpcBehaviorChildDomain,
  getNpcBehaviorChildConnectionType,
  getNpcBehaviorChildPinSide,
  getNpcBehaviorConnectionColor,
  isNpcBehaviorSupportedDescriptorCategory,
} from "../../src/shared/node-editor/npcBehaviorWorkspaceSemantics";
import { parseDocumentText } from "../../webview/hytale-node-editor/src/node-editor/parsing/parseDocument.svelte";
import { serializeWorkspaceState } from "../../webview/hytale-node-editor/src/node-editor/parsing/serializeDocument";
import {
  areSemanticallyEquivalentValues,
  formatSemanticDiff,
  normalizeRoundTripJson,
  normalizeWorkspaceStateForSemanticComparison,
} from "./helpers";

const schemaDir = path.resolve(process.cwd(), "default-data/export-data/schemas");
const workspacesRootPath = path.resolve(process.cwd(), "default-data/node-editor-workspace-definitions");
const descriptorsPath = path.resolve(process.cwd(), "default-data/export-data/npc_descriptors.json");

const logger = {
  error() {},
  warn() {},
  info() {},
  debug() {},
};

function createWorkspaceRuntime(): WorkspaceRuntime {
  const schemaRuntime = new SchemaRuntime(schemaDir, logger);
  return new WorkspaceRuntime(workspacesRootPath, schemaRuntime, logger);
}

function parseDescriptors(): NpcDescriptorDocument {
  return JSON.parse(readFileSync(descriptorsPath, "utf8")) as NpcDescriptorDocument;
}

function mergeAttributes(descriptors: NpcDescriptorDocument): Array<{ Name: string; Type: string; Domain?: unknown }> {
  const attributesByName = new Map<string, { Name: string; Type: string; Domain?: unknown }>();
  for (const descriptor of descriptors) {
    for (const attribute of descriptor.Attributes ?? []) {
      if (!attributesByName.has(attribute.Name)) {
        attributesByName.set(attribute.Name, attribute);
      }
    }
  }
  return Array.from(attributesByName.values());
}

function getNpcBehaviorContext(rootId: NpcGraphTargetWorkspaceRoot): NodeEditorWorkspaceContext {
  const workspaceRuntime = createWorkspaceRuntime();
  const context = workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", rootId);
  expect(context).toBeDefined();
  return context!;
}

function expectSemanticRoundTrip(
  documentRoot: Record<string, unknown>,
  context: NodeEditorWorkspaceContext,
): Record<string, unknown> {
  const parsed = parseDocumentText(JSON.stringify(documentRoot), context);
  const serialized = normalizeRoundTripJson(
    serializeWorkspaceState(parsed, context.rootMenuName),
  ) as Record<string, unknown>;
  const reparsed = parseDocumentText(JSON.stringify(serialized), context);
  const expected = normalizeWorkspaceStateForSemanticComparison(parsed);
  const actual = normalizeWorkspaceStateForSemanticComparison(reparsed);

  if (!areSemanticallyEquivalentValues(expected, actual)) {
    throw new Error(formatSemanticDiff(expected, actual));
  }

  return serialized;
}

describe("NPC Behavior workspace generation", () => {
  test("loads the generated NPC Behavior workspace with the planned roots and support templates", () => {
    const workspaceRuntime = createWorkspaceRuntime();
    const workspace = workspaceRuntime.nodeEditorWorkspaces["NPC Behavior"];
    expect(workspace).toBeDefined();

    expect(Object.keys(workspace.roots).sort()).toEqual([
      "Action",
      "ActionList",
      "BodyMotion",
      "HeadMotion",
      "Instruction",
      "Instructions",
      "Path",
      "Sensor",
      "StateTransitions",
    ]);
    expect(workspace.roots.Action.RootNodeType).toBe("ActionContentVariants");
    expect(workspace.roots.ActionList.RootNodeType).toBe("Structural.ActionListRoot");
    expect(workspace.roots.BodyMotion.RootNodeType).toBe("BodyMotionVariants");
    expect(workspace.roots.HeadMotion.RootNodeType).toBe("HeadMotionVariants");
    expect(workspace.roots.Instruction.RootNodeType).toBe("InstructionVariants");
    expect(workspace.roots.Instructions.RootNodeType).toBe("Structural.InstructionListRoot");
    expect(workspace.roots.Path.RootNodeType).toBe("Path.Path");
    expect(workspace.roots.Sensor.RootNodeType).toBe("SensorVariants");
    expect(workspace.roots.StateTransitions.RootNodeType).toBe("Structural.StateTransitionListRoot");
    expect(workspace.variantKindsById.ActionContentVariants.Variants.ActionReference).toBe(
      "Action.ActionReference",
    );
    expect(workspace.variantKindsById.ActionContentVariants.Variants.ActionListReference).toBeUndefined();
    expect(workspace.variantKindsById.InstructionVariants).toEqual({
      VariantFieldName: "Type",
      DefaultTemplateId: "Structural.InstructionNode",
      Variants: {
        Random: "Structural.RandomInstructionNode",
      },
    });

    expect(workspace.nodeTemplatesById["Structural.InstructionNode"]).toBeDefined();
    expect(
      getCreatableRootTemplates(getNpcBehaviorContext("Instruction")).map(
        template => template.templateId,
      ),
    ).toEqual([
      "Structural.InstructionNode",
      "Structural.RandomInstructionNode",
      "Structural.InstructionReference",
    ]);
    expect(
      getCreatableRootTemplates(getNpcBehaviorContext("ActionList")).map(
        template => template.templateId,
      ),
    ).toEqual(["Structural.ActionListRoot"]);
    expect(workspace.nodeTemplatesById["Structural.ActionListRoot"]).toBeDefined();
    expect(
      workspace.nodeTemplatesById["Structural.ActionListRoot"].childSchemas.Actions,
    ).toMatchObject({
      targetTemplateOrVariantId: "ActionContentVariants",
      serializationType: "root",
      allowComponentReferences: true,
      componentReferenceSlotOccupancy: "normal-item",
    });
    expect(workspace.nodeTemplatesById["Structural.RandomInstructionNode"]).toBeDefined();
    expect(workspace.nodeTemplatesById["Structural.WeightedInstruction"]).toBeDefined();
    expect(workspace.nodeTemplatesById["Structural.InstructionNode"].nodeColor).toBe(
      NPC_BEHAVIOR_REFERENCE_DARK_COLORS.default,
    );
    expect(workspace.connectionTypesById.PositionSensor.extends).toEqual(["Sensor"]);
    expect(
      workspace.nodeTemplatesById["Structural.InstructionListRoot"].childSchemas.Instructions
        ?.serializationType,
    ).toBe("root");
    expect(
      workspace.nodeTemplatesById["Structural.InstructionNode"].inputPins.some(
        pin => pin.schemaKey === "Sensor",
      ),
    ).toBe(true);
    expect(workspace.nodeTemplatesById["Structural.InstructionNode"].defaultTitle).toBe(
      "Instruction",
    );
    expect(workspace.nodeTemplatesById["Structural.RandomInstructionNode"].defaultTitle).toBe(
      "Random Instruction",
    );
    expect(workspace.nodeTemplatesById["Structural.InstructionReference"].defaultTitle).toBe(
      "Instruction Reference",
    );
    expect(
      workspace.nodeTemplatesById["Sensor.Any"].outputPins.some(
        pin => pin.localId === "Output" && pin.connectionType === "Sensor",
      ),
    ).toBe(true);
    expect(workspace.nodeTemplatesById["Sensor.Any"].defaultTitle).toBe("Sensor: Any");
    expect(workspace.nodeTemplatesById["Sensor.Any"].nodeColor).toBe(
      NPC_BEHAVIOR_REFERENCE_DARK_COLORS.sensor,
    );
    expect(
      workspace.nodeTemplatesById["Sensor.Target"].outputPins.some(
        pin => pin.localId === "Output" && pin.connectionType === "PositionSensor",
      ),
    ).toBe(true);
    expect(workspace.nodeTemplatesById["Action.Timeout"].nodeColor).toBe(
      NPC_BEHAVIOR_REFERENCE_DARK_COLORS.action,
    );
    expect(workspace.nodeTemplatesById["BodyMotion.Sequence"].nodeColor).toBe(
      NPC_BEHAVIOR_REFERENCE_DARK_COLORS.bodyMotion,
    );
    expect(workspace.nodeTemplatesById["HeadMotion.Sequence"].nodeColor).toBe(
      NPC_BEHAVIOR_REFERENCE_DARK_COLORS.headMotion,
    );
    expect(workspace.nodeTemplatesById["IEntityFilter.LineOfSight"].nodeColor).toBe(
      NPC_BEHAVIOR_REFERENCE_DARK_COLORS.filter,
    );
    expect(workspace.nodeTemplatesById["WeightedAction.WeightedAction"].nodeColor).toBe(
      NPC_BEHAVIOR_REFERENCE_DARK_COLORS.action,
    );
    expect(workspace.nodeTemplatesById["Path.Path"].nodeColor).toBe(
      NPC_BEHAVIOR_REFERENCE_DARK_COLORS.action,
    );
    expect(workspace.nodeTemplatesById["ValueToParameterMapping.ValueToParameterMapping"].nodeColor).toBe(
      NPC_BEHAVIOR_REFERENCE_DARK_COLORS.sensor,
    );
    expect(
      workspace.nodeTemplatesById["IEntityFilter.LineOfSight"].outputPins.some(
        pin => pin.localId === "Output" && pin.connectionType === "IEntityFilter",
      ),
    ).toBe(true);
    expect(workspace.nodeTemplatesById["Structural.InstructionNode"].fieldsBySchemaKey.Enabled?.computable).toBe(true);
    expect(workspace.nodeTemplatesById["Structural.InstructionNode"].fieldsBySchemaKey.Weight).toBeUndefined();
    expect(
      workspace.nodeTemplatesById["Structural.WeightedInstruction"].fieldsBySchemaKey.Weight?.computable,
    ).toBe(true);
    expect(workspace.nodeTemplatesById["Sensor.Target"].fieldsBySchemaKey.Range?.computable).toBe(true);
    expect(workspace.nodeTemplatesById["Sensor.Target"].fieldsBySchemaKey.TargetSlot?.computable).toBe(true);
    expect(workspace.nodeTemplatesById["Action.Timeout"]).toBeDefined();
    expect(workspace.nodeTemplatesById["Structural.StateTransitionNode"]).toBeDefined();
    expect(workspace.nodeTemplatesById["Structural.StateTransitionMappingNode"]).toBeDefined();
    expect(workspace.nodeTemplatesById["WeightedAction.WeightedAction"]).toBeDefined();
    expect(workspace.nodeTemplatesById["Path.Path"]).toBeDefined();
    expect(workspace.nodeTemplatesById["RelativeWaypointDefinition.RelativeWaypointDefinition"]).toBeDefined();
    expect(workspace.nodeTemplatesById["ValueToParameterMapping.ValueToParameterMapping"]).toBeDefined();
    expect(
      workspace.nodeTemplatesById["ISensorEntityPrioritiser.Attitude"].outputPins.some(
        pin => pin.localId === "Output" && pin.connectionType === "ISensorEntityPrioritiser",
      ),
    ).toBe(true);
    expect(
      workspace.nodeTemplatesById["Path.Path"].outputPins.some(
        pin => pin.localId === "Output" && pin.connectionType === "Path",
      ),
    ).toBe(true);
    expect(
      workspace.nodeTemplatesById["WeightedAction.WeightedAction"].inputPins.some(
        pin => pin.localId === "Input" && pin.connectionType === "WeightedAction",
      ),
    ).toBe(true);
    expect(
      workspace.nodeTemplatesById["Structural.WeightedInstruction"].inputPins.some(
        pin => pin.localId === "Input" && pin.connectionType === "WeightedInstruction",
      ),
    ).toBe(true);
    expect(
      workspace.nodeTemplatesById["Structural.WeightedInstruction"].outputPins.some(
        pin => pin.schemaKey === "Instruction" && pin.connectionType === "Instruction",
      ),
    ).toBe(true);
    expect(
      workspace.nodeTemplatesById["ValueToParameterMapping.ValueToParameterMapping"].outputPins.some(
        pin => pin.localId === "Output" && pin.connectionType === "ValueToParameterMapping",
      ),
    ).toBe(true);
  });

  test("filters the StateTransitions root to actions and state-transition templates", () => {
    const context = getNpcBehaviorContext("StateTransitions");

    expect(Object.keys(context.templateCategories).sort()).toEqual(["Actions", "State Transitions"]);
    expect(context.templateCategories.Actions).toContain("Action.Timeout");
    expect(context.templateCategories["State Transitions"]).toEqual([
      "Structural.StateTransitionNode",
      "Structural.StateTransitionMappingNode",
    ]);
    expect(context.templateCategories.Sensors).toBeUndefined();

    const transitionNode = context.nodeTemplatesById["Structural.StateTransitionNode"];
    const mappingNode = context.nodeTemplatesById["Structural.StateTransitionMappingNode"];
    expect(transitionNode.inputPins.some(pin => pin.schemaKey === "States")).toBe(true);
    expect(transitionNode.outputPins.some(pin => pin.schemaKey === "States")).toBe(false);
    expect(mappingNode.outputPins.some(pin => pin.connectionType === "StateTransitionMapping")).toBe(true);
    expect(mappingNode.inputPins.some(pin => pin.connectionType === "StateTransitionMapping")).toBe(false);
  });

  test("uses the reference editor dark-theme palette for generated NPC node families", () => {
    const workspaceRuntime = createWorkspaceRuntime();
    const workspace = workspaceRuntime.nodeEditorWorkspaces["NPC Behavior"];

    expect(workspace.nodeTemplatesById["Structural.InstructionNode"].nodeColor).toBe(
      getNpcBehaviorCategoryColor("Structural"),
    );
    expect(workspace.nodeTemplatesById["Structural.RandomInstructionNode"].nodeColor).toBe(
      getNpcBehaviorCategoryColor("Structural"),
    );
    expect(workspace.nodeTemplatesById["Sensor.Target"].nodeColor).toBe(
      getNpcBehaviorCategoryColor("Sensor"),
    );
    expect(workspace.nodeTemplatesById["ISensorEntityCollector.CombatTargets"].nodeColor).toBe(
      getNpcBehaviorCategoryColor("ISensorEntityCollector"),
    );
    expect(workspace.nodeTemplatesById["ISensorEntityPrioritiser.Attitude"].nodeColor).toBe(
      getNpcBehaviorCategoryColor("ISensorEntityPrioritiser"),
    );
    expect(workspace.nodeTemplatesById["Action.Timeout"].nodeColor).toBe(
      getNpcBehaviorCategoryColor("Action"),
    );
    expect(workspace.nodeTemplatesById["WeightedAction.WeightedAction"].nodeColor).toBe(
      getNpcBehaviorCategoryColor("WeightedAction"),
    );
    expect(workspace.nodeTemplatesById["Path.Path"].nodeColor).toBe(
      getNpcBehaviorCategoryColor("Path"),
    );
    expect(
      workspace.nodeTemplatesById["RelativeWaypointDefinition.RelativeWaypointDefinition"].nodeColor,
    ).toBe(getNpcBehaviorCategoryColor("RelativeWaypointDefinition"));
    expect(workspace.nodeTemplatesById["ValueToParameterMapping.ValueToParameterMapping"].nodeColor).toBe(
      getNpcBehaviorCategoryColor("ValueToParameterMapping"),
    );
    expect(workspace.nodeTemplatesById["BodyMotion.Sequence"].nodeColor).toBe(
      getNpcBehaviorCategoryColor("BodyMotion"),
    );
    expect(workspace.nodeTemplatesById["HeadMotion.Sequence"].nodeColor).toBe(
      getNpcBehaviorCategoryColor("HeadMotion"),
    );
    expect(workspace.nodeTemplatesById["IEntityFilter.LineOfSight"].nodeColor).toBe(
      getNpcBehaviorCategoryColor("IEntityFilter"),
    );
  });

  test("maps supported NPC child domains to known semantic connection types and expected pin sides", () => {
    const workspaceRuntime = createWorkspaceRuntime();
    const workspace = workspaceRuntime.nodeEditorWorkspaces["NPC Behavior"];
    const allDescriptors = parseDescriptors();
    const supportedDescriptors = allDescriptors.filter(descriptor =>
      isNpcBehaviorSupportedDescriptorCategory(descriptor.Category),
    );
    const mappedDomains = new Set<string>();

    for (const descriptor of supportedDescriptors) {
      const template = workspace.nodeTemplatesById[`${descriptor.Category}.${descriptor.Name}`];
      if (!template) {
        throw new Error(`Expected generated template ${descriptor.Category}.${descriptor.Name}.`);
      }

      for (const attribute of descriptor.Attributes ?? []) {
        const domain = getNpcBehaviorChildDomain(
          attribute.Type,
          typeof attribute.Domain === "string" ? attribute.Domain : undefined,
        );
        if (!domain) {
          continue;
        }

        mappedDomains.add(domain);
        const mapping = NPC_BEHAVIOR_CHILD_DOMAIN_DEFINITIONS[domain];
        expect(mapping, `${descriptor.Category}.${descriptor.Name}.${attribute.Name}`).toBeDefined();
        const expectedConnectionType = getNpcBehaviorChildConnectionType(
          descriptor.Category,
          descriptor.Name,
          attribute.Name,
          domain,
        );
        expect(expectedConnectionType, `${descriptor.Category}.${descriptor.Name}.${attribute.Name}`).toBeDefined();
        expect(NPC_BEHAVIOR_CONNECTION_DEFINITIONS[expectedConnectionType!]).toBeDefined();

        const expectedSide = getNpcBehaviorChildPinSide(
          descriptor.Category,
          descriptor.Name,
          attribute.Name,
          domain,
        );
        const actualPin =
          expectedSide === "input"
            ? template.inputPins.find(pin => pin.schemaKey === attribute.Name)
            : template.outputPins.find(pin => pin.schemaKey === attribute.Name);

        expect(actualPin, `${descriptor.Category}.${descriptor.Name}.${attribute.Name}`).toBeDefined();
        expect(actualPin?.connectionType).toBe(expectedConnectionType);
        expect(actualPin?.color).toBe(getNpcBehaviorConnectionColor(expectedConnectionType!));
      }
    }

    const instructionDescriptors = allDescriptors.filter(descriptor => descriptor.Category === "Instruction");
    for (const descriptor of instructionDescriptors) {
      const templateId =
        descriptor.Name === "Instruction"
          ? "Structural.InstructionNode"
          : descriptor.Name === "Random"
            ? "Structural.RandomInstructionNode"
            : undefined;
      if (!templateId) {
        continue;
      }

      const instructionNode = workspace.nodeTemplatesById[templateId];
      if (!instructionNode) {
        throw new Error(`Expected generated template ${templateId}.`);
      }

      for (const attribute of descriptor.Attributes ?? []) {
        const domain = getNpcBehaviorChildDomain(
          attribute.Type,
          typeof attribute.Domain === "string" ? attribute.Domain : undefined,
        );
        if (!domain) {
          continue;
        }

        mappedDomains.add(domain);
        const mapping = NPC_BEHAVIOR_CHILD_DOMAIN_DEFINITIONS[domain];
        expect(mapping, `${descriptor.Name}.${attribute.Name}`).toBeDefined();

        const expectedConnectionType =
          descriptor.Name === "Random" && attribute.Name === "Instructions"
            ? "WeightedInstruction"
            : getNpcBehaviorChildConnectionType(
                "Structural",
                "Instruction",
                attribute.Name,
                domain,
              );
        expect(expectedConnectionType, `${descriptor.Name}.${attribute.Name}`).toBeDefined();

        const expectedSide =
          descriptor.Name === "Random" && attribute.Name === "Instructions"
            ? "output"
            : getNpcBehaviorChildPinSide(
                "Structural",
                "Instruction",
                attribute.Name,
                domain,
              );
        const actualPin =
          expectedSide === "input"
            ? instructionNode.inputPins.find(pin => pin.schemaKey === attribute.Name)
            : instructionNode.outputPins.find(pin => pin.schemaKey === attribute.Name);

        expect(actualPin, `${descriptor.Name}.${attribute.Name}`).toBeDefined();
        expect(actualPin?.connectionType).toBe(expectedConnectionType);
        expect(actualPin?.color).toBe(getNpcBehaviorConnectionColor(expectedConnectionType!));
      }
    }

    expect([...mappedDomains].sort()).toEqual(
      Object.keys(NPC_BEHAVIOR_CHILD_DOMAIN_DEFINITIONS).sort(),
    );
  });

  test("generates typed parent compatibility inputs and no Generic NPC behavior pins", () => {
    const workspaceRuntime = createWorkspaceRuntime();
    const workspace = workspaceRuntime.nodeEditorWorkspaces["NPC Behavior"];

    for (const template of Object.values(workspace.nodeTemplatesById)) {
      expect(template.inputPins.some(pin => pin.connectionType === "Generic")).toBe(false);
      expect(template.outputPins.some(pin => pin.connectionType === "Generic")).toBe(false);
    }

    const instructionNode = workspace.nodeTemplatesById["Structural.InstructionNode"];
    expect(
      instructionNode.inputPins.some(
        pin => pin.connectionType === "Instruction" && pin.label === "Parent",
      ),
    ).toBe(true);
    expect(
      instructionNode.inputPins.some(pin => pin.schemaKey === "Sensor" && pin.connectionType === "Sensor"),
    ).toBe(true);
    expect(instructionNode.inputPins.map(pin => pin.label)).toEqual([
      "Sensor",
      "Parent",
    ]);

    const targetSensor = workspace.nodeTemplatesById["Sensor.Target"];
    expect(targetSensor.inputPins.some(pin => pin.connectionType === "Sensor")).toBe(false);
    expect(
      targetSensor.inputPins.some(pin => pin.schemaKey === "Filters" && pin.connectionType === "IEntityFilter"),
    ).toBe(true);
    expect(
      targetSensor.outputPins.some(
        pin => pin.localId === "Output" && pin.connectionType === "PositionSensor",
      ),
    ).toBe(true);

    const anySensor = workspace.nodeTemplatesById["Sensor.Any"];
    expect(anySensor.inputPins.length).toBe(0);
    expect(anySensor.outputPins.some(pin => pin.localId === "Output" && pin.connectionType === "Sensor")).toBe(true);

    const stateSensor = workspace.nodeTemplatesById["Sensor.State"];
    expect(Object.keys(stateSensor.fieldsBySchemaKey).sort()).toEqual([
      "Enabled",
      "IgnoreMissingSetState",
      "Once",
      "State",
    ]);
    expect(stateSensor.fieldsBySchemaKey.Type).toBeUndefined();
    expect(stateSensor.schemaConstants.Type).toBe("State");

    const blockSensor = workspace.nodeTemplatesById["Sensor.Block"];
    expect(blockSensor.inputPins.length).toBe(0);
    expect(
      blockSensor.outputPins.some(
        pin => pin.localId === "Output" && pin.connectionType === "PositionSensor",
      ),
    ).toBe(true);

    const lineOfSightFilter = workspace.nodeTemplatesById["IEntityFilter.LineOfSight"];
    expect(lineOfSightFilter.inputPins.length).toBe(0);
    expect(
      lineOfSightFilter.outputPins.some(
        pin => pin.localId === "Output" && pin.connectionType === "IEntityFilter",
      ),
    ).toBe(true);

    const playerSensor = workspace.nodeTemplatesById["Sensor.Player"];
    expect(
      playerSensor.inputPins.some(
        pin => pin.schemaKey === "Prioritiser" && pin.connectionType === "ISensorEntityPrioritiser",
      ),
    ).toBe(true);
    expect(
      playerSensor.outputPins.some(
        pin => pin.schemaKey === "Collector" && pin.connectionType === "ISensorEntityCollector",
      ),
    ).toBe(true);

    const valueProviderWrapper = workspace.nodeTemplatesById["Sensor.ValueProviderWrapper"];
    expect(
      valueProviderWrapper.inputPins.some(
        pin => pin.schemaKey === "Sensor" && pin.connectionType === "Sensor",
      ),
    ).toBe(true);
    expect(
      valueProviderWrapper.outputPins.some(
        pin => pin.localId === "Output" && pin.connectionType === "Sensor",
      ),
    ).toBe(true);
    expect(
      valueProviderWrapper.outputPins.some(
        pin => pin.schemaKey === "Sensor" && pin.connectionType === "Sensor",
      ),
    ).toBe(false);

    const adjustPosition = workspace.nodeTemplatesById["Sensor.AdjustPosition"];
    expect(
      adjustPosition.inputPins.some(
        pin => pin.schemaKey === "Sensor" && pin.connectionType === "PositionSensor",
      ),
    ).toBe(true);
    expect(
      adjustPosition.outputPins.some(
        pin => pin.localId === "Output" && pin.connectionType === "PositionSensor",
      ),
    ).toBe(true);

    const blockType = workspace.nodeTemplatesById["Sensor.BlockType"];
    expect(
      blockType.inputPins.some(
        pin => pin.schemaKey === "Sensor" && pin.connectionType === "PositionSensor",
      ),
    ).toBe(true);
    expect(
      blockType.outputPins.some(
        pin => pin.localId === "Output" && pin.connectionType === "PositionSensor",
      ),
    ).toBe(true);
    expect(
      valueProviderWrapper.inputPins.some(
        pin =>
          pin.schemaKey === "ValueToParameterMappings" &&
          pin.connectionType === "ValueToParameterMapping",
      ),
    ).toBe(true);

    const makePathAction = workspace.nodeTemplatesById["Action.MakePath"];
    expect(
      makePathAction.inputPins.some(pin => pin.schemaKey === "Path" && pin.connectionType === "Path"),
    ).toBe(true);
    expect(makePathAction.outputPins.some(pin => pin.schemaKey === "Path")).toBe(false);

    const pathTemplate = workspace.nodeTemplatesById["Path.Path"];
    expect(pathTemplate.inputPins.some(pin => pin.schemaKey === "Waypoints")).toBe(true);
    expect(
      pathTemplate.outputPins.some(pin => pin.localId === "Output" && pin.connectionType === "Path"),
    ).toBe(true);

    const weightedAction = workspace.nodeTemplatesById["WeightedAction.WeightedAction"];
    expect(weightedAction.inputPins.some(pin => pin.localId === "Input" && pin.connectionType === "WeightedAction")).toBe(true);
    expect(
      workspace.nodeTemplatesById["Action.Random"].outputPins.some(
        pin => pin.schemaKey === "Actions" && pin.connectionType === "WeightedAction",
      ),
    ).toBe(true);
    expect(
      weightedAction.outputPins.some(pin => pin.schemaKey === "Action" && pin.connectionType === "Action"),
    ).toBe(true);

    const randomInstruction = workspace.nodeTemplatesById["Structural.RandomInstructionNode"];
    expect(randomInstruction.outputPins.some(pin => pin.schemaKey === "Actions")).toBe(false);
    expect(randomInstruction.outputPins.some(pin => pin.schemaKey === "BodyMotion")).toBe(false);
    expect(randomInstruction.outputPins.some(pin => pin.schemaKey === "HeadMotion")).toBe(false);
    expect(
      randomInstruction.outputPins.some(
        pin => pin.schemaKey === "Instructions" && pin.connectionType === "WeightedInstruction",
      ),
    ).toBe(true);
    expect(randomInstruction.schemaConstants.Type).toBe("Random");

    const weightedInstruction = workspace.nodeTemplatesById["Structural.WeightedInstruction"];
    expect(
      weightedInstruction.outputPins.some(
        pin => pin.schemaKey === "Instruction" && pin.connectionType === "Instruction",
      ),
    ).toBe(true);
    expect(weightedInstruction.childSchemas.Instruction?.serializationType).toBe("sibling");

    const instructionsRoot = workspace.nodeTemplatesById["Structural.InstructionListRoot"];
    expect(instructionsRoot.inputPins.length).toBe(0);
    expect(
      Object.keys(workspace.connectionTypesById).sort(),
    ).toEqual(Object.keys(NPC_BEHAVIOR_CONNECTION_TYPES_FOR_WORKSPACE).sort());
  });

  test("round-trips the Instruction root with nested actions, weighted actions, paths, and child instructions", () => {
    const context = getNpcBehaviorContext("Instruction");
    const serialized = expectSemanticRoundTrip(
      {
        $NodeId: "Instruction-1",
        Name: "Root",
        Enabled: true,
        Sensor: {
          $NodeId: "Sensor-1",
          Type: "Target",
          TargetSlot: "LockedTarget",
          Range: 12,
          Filters: [
            {
              $NodeId: "Filter-1",
              Type: "Altitude",
              AltitudeRange: [64, 96],
            },
          ],
        },
        Actions: [
          {
            $NodeId: "Action-1",
            Type: "Random",
            Actions: [
              {
                $NodeId: "WeightedAction-1",
                Weight: 2.5,
                Action: {
                  $NodeId: "Action-2",
                  Type: "Nothing",
                  Once: true,
                },
              },
              {
                $NodeId: "WeightedAction-2",
                Weight: 1,
                Action: {
                  $NodeId: "Action-3",
                  Type: "MakePath",
                  Path: {
                    $NodeId: "Path-1",
                    Scale: 1.5,
                    Waypoints: [
                      {
                        $NodeId: "Waypoint-1",
                        Distance: 3,
                        Rotation: 45,
                      },
                    ],
                  },
                },
              },
            ],
          },
          {
            $NodeId: "Action-4",
            Type: "Timeout",
            Delay: [1, 2],
            Action: {
              $NodeId: "Action-5",
              Type: "Nothing",
            },
          },
        ],
        Instructions: [
          {
            $NodeId: "Instruction-2",
            Name: "Child",
            Continue: true,
          },
        ],
      },
      context,
    );

    expect(serialized.Actions).toBeInstanceOf(Array);
    expect((serialized.Actions as unknown[])).toHaveLength(2);
    expect(((serialized.Actions as Record<string, unknown>[])[0].Actions as unknown[])).toHaveLength(2);
    expect(
      (((serialized.Actions as Record<string, unknown>[])[0].Actions as Record<string, unknown>[])[1]
        .Action as Record<string, unknown>).Path,
    ).toBeTruthy();
    expect(serialized.Instructions).toBeInstanceOf(Array);
  });

  test("round-trips the random Instruction root through weighted instruction wrappers", () => {
    const context = getNpcBehaviorContext("Instruction");
    const serialized = expectSemanticRoundTrip(
      {
        $NodeId: "Instruction-1",
        Type: "Random",
        Name: "Choose",
        Continue: true,
        ResetOnStateChange: false,
        ExecuteFor: [1, 2],
        Instructions: [
          {
            Weight: 2.5,
            Name: "Choice A",
          },
          {
            Weight: 1,
            Reference: "Component_Instruction_Generic_Idle",
          },
        ],
      },
      context,
    );

    expect(serialized.Type).toBe("Random");
    expect((serialized.Instructions as Record<string, unknown>[])[0]).toMatchObject({
      Weight: 2.5,
      Name: "Choice A",
    });
    expect((serialized.Instructions as Record<string, unknown>[])[1]).toMatchObject({
      Weight: 1,
      Reference: "Component_Instruction_Generic_Idle",
    });
  });

  test("round-trips reverse-input sensor and filter child slots in the generated NPC workspace", () => {
    const context = getNpcBehaviorContext("Instruction");
    const serialized = expectSemanticRoundTrip(
      {
        $NodeId: "Instruction-1",
        Name: "Root",
        Sensor: {
          $NodeId: "Sensor-1",
          Type: "Player",
          Prioritiser: {
            $NodeId: "Prioritiser-1",
            Type: "Attitude",
            AttitudesByPriority: ["HOSTILE", "NEUTRAL", "FRIENDLY"],
          },
          Collector: {
            $NodeId: "Collector-1",
            Type: "CombatTargets",
          },
          Filters: [
            {
              $NodeId: "Filter-1",
              Type: "And",
              Filters: [
                {
                  $NodeId: "Filter-2",
                  Type: "LineOfSight",
                },
              ],
            },
          ],
        },
      },
      context,
    );

    expect((serialized.Sensor as Record<string, unknown>).Type).toBe("Player");
    expect(
      ((serialized.Sensor as Record<string, unknown>).Prioritiser as Record<string, unknown>).Type,
    ).toBe("Attitude");
    expect(
      ((serialized.Sensor as Record<string, unknown>).Collector as Record<string, unknown>).Type,
    ).toBe("CombatTargets");
    expect(
      (((serialized.Sensor as Record<string, unknown>).Filters as Record<string, unknown>[])[0]
        .Filters as Record<string, unknown>[])[0].Type,
    ).toBe("LineOfSight");
  });

  test("round-trips compute-shaped field values for computable generated fields", () => {
    const context = getNpcBehaviorContext("Instruction");
    const serialized = expectSemanticRoundTrip(
      {
        $NodeId: "Instruction-1",
        Type: "Random",
        Enabled: { Compute: "isEmpty(TargetSlot)" },
        Sensor: {
          $NodeId: "Sensor-1",
          Type: "Target",
          TargetSlot: { Compute: "TargetParameter" },
          Range: { Compute: "randomInRange(5, 10)" },
        },
        Instructions: [
          {
            Weight: { Compute: "randomInRange(1, 3)" },
            Name: "Weighted Child",
          },
        ],
      },
      context,
    );

    expect(serialized.Enabled).toEqual({ Compute: "isEmpty(TargetSlot)" });
    expect((serialized.Instructions as Record<string, unknown>[])[0].Weight).toEqual({
      Compute: "randomInRange(1, 3)",
    });
    expect((serialized.Sensor as Record<string, unknown>).TargetSlot).toEqual({
      Compute: "TargetParameter",
    });
    expect((serialized.Sensor as Record<string, unknown>).Range).toEqual({
      Compute: "randomInRange(5, 10)",
    });
  });

  test("round-trips the Sensor root with nested mappings and wrapped sensors", () => {
    const context = getNpcBehaviorContext("Sensor");
    const serialized = expectSemanticRoundTrip(
      {
        $NodeId: "Sensor-1",
        Type: "ValueProviderWrapper",
        Once: false,
        Enabled: true,
        PassValues: true,
        Sensor: {
          $NodeId: "Sensor-2",
          Type: "Random",
          TrueDurationRange: [1, 2],
          FalseDurationRange: [3, 4],
        },
        ValueToParameterMappings: [
          {
            $NodeId: "Mapping-1",
            ValueType: "String",
            FromValue: "LockedTarget",
            ToParameter: "TargetSlot",
          },
        ],
      },
      context,
    );

    expect(serialized.Type).toBe("ValueProviderWrapper");
    expect(serialized.Sensor).toBeTruthy();
    expect(serialized.ValueToParameterMappings).toBeInstanceOf(Array);
    expect((serialized.ValueToParameterMappings as unknown[])).toHaveLength(1);
  });

  test("round-trips component behavior content roots", () => {
    expect(
      expectSemanticRoundTrip(
        {
          $NodeId: "Action-1",
          Type: "Timeout",
          Delay: [1, 2],
          Action: {
            $NodeId: "Action-2",
            Type: "Nothing",
          },
        },
        getNpcBehaviorContext("Action"),
      ),
    ).toMatchObject({
      Type: "Timeout",
      Action: {
        Type: "Nothing",
      },
    });

    expect(
      expectSemanticRoundTrip(
        {
          Actions: [
            {
              $NodeId: "Action-1",
              Reference: "Component_Test_Action_Sequence",
            },
            {
              $NodeId: "Action-2",
              Type: "PlayAnimation",
              Animation: "Wave",
            },
          ],
        },
        getNpcBehaviorContext("ActionList"),
      ).Actions,
    ).toHaveLength(2);

    expect(
      expectSemanticRoundTrip(
        {
          $NodeId: "BodyMotion-1",
          Type: "Sequence",
          Motions: [
            {
              $NodeId: "BodyMotion-2",
              Type: "Nothing",
            },
          ],
        },
        getNpcBehaviorContext("BodyMotion"),
      ),
    ).toMatchObject({
      Type: "Sequence",
      Motions: [
        {
          Type: "Nothing",
        },
      ],
    });

    expect(
      expectSemanticRoundTrip(
        {
          $NodeId: "HeadMotion-1",
          Type: "Sequence",
          Motions: [
            {
              $NodeId: "HeadMotion-2",
              Type: "Nothing",
            },
          ],
        },
        getNpcBehaviorContext("HeadMotion"),
      ),
    ).toMatchObject({
      Type: "Sequence",
      Motions: [
        {
          Type: "Nothing",
        },
      ],
    });

    expect(
      expectSemanticRoundTrip(
        {
          $NodeId: "Path-1",
          Scale: {
            Compute: "Scale",
          },
          Waypoints: [
            {
              $NodeId: "Waypoint-1",
              Distance: 4,
              Rotation: 90,
            },
          ],
        },
        getNpcBehaviorContext("Path"),
      ),
    ).toMatchObject({
      Scale: {
        Compute: "Scale",
      },
      Waypoints: [
        {
          Distance: 4,
          Rotation: 90,
        },
      ],
    });
  });

  test("round-trips the Instructions root wrapper with multiple instruction children", () => {
    const context = getNpcBehaviorContext("Instructions");
    const serialized = expectSemanticRoundTrip(
      {
        Instructions: [
          {
            $NodeId: "Instruction-1",
            Name: "First",
          },
          {
            $NodeId: "Instruction-2",
            Type: "Random",
            Instructions: [
              {
                Weight: 2,
                Name: "Nested",
              },
            ],
          },
        ],
      },
      context,
    );

    expect(serialized.Instructions).toBeInstanceOf(Array);
    expect((serialized.Instructions as unknown[])).toHaveLength(2);
    expect(
      ((serialized.Instructions as Record<string, unknown>[])[1].Instructions as Record<string, unknown>[])[0]
        .Weight,
    ).toBe(2);
  });

  test("round-trips the StateTransitions root with nested mappings and shared actions", () => {
    const context = getNpcBehaviorContext("StateTransitions");
    const serialized = expectSemanticRoundTrip(
      {
        StateTransitions: [
          {
            $NodeId: "Transition-1",
            $Comment: "Alert",
            Enabled: {
              Compute: "CanAlert",
            },
            States: [
              {
                $NodeId: "Mapping-1",
                From: ["Idle"],
                To: ["Alerted"],
                Priority: 2,
                Enabled: true,
              },
              {
                $NodeId: "Mapping-2",
                From: ["Search"],
                To: ["Idle"],
              },
            ],
            Actions: [
              {
                $NodeId: "Action-1",
                Type: "Timeout",
                Delay: [1, 1],
              },
            ],
          },
        ],
      },
      context,
    );

    expect(serialized.StateTransitions).toHaveLength(1);
    expect(serialized.StateTransitions?.[0]).toMatchObject({
      $Comment: "Alert",
      Enabled: {
        Compute: "CanAlert",
      },
    });
    expect(serialized.StateTransitions?.[0]?.$NodeId).toMatch(/^Transition-1-/);
    expect(serialized.StateTransitions?.[0]?.States).toHaveLength(2);
    expect(serialized.StateTransitions?.[0]?.States?.[0]).toMatchObject({
      From: ["Idle"],
      To: ["Alerted"],
      Priority: 2,
      Enabled: true,
    });
    expect(serialized.StateTransitions?.[0]?.States?.[0]?.$NodeId).toMatch(/^Mapping-1-/);
    expect(serialized.StateTransitions?.[0]?.States?.[1]).toMatchObject({
      From: ["Search"],
      To: ["Idle"],
    });
    expect(serialized.StateTransitions?.[0]?.States?.[1]?.$NodeId).toMatch(/^Mapping-2-/);
    expect(serialized.StateTransitions?.[0]?.Actions).toHaveLength(1);
    expect(serialized.StateTransitions?.[0]?.Actions?.[0]).toMatchObject({
      Type: "Timeout",
      Delay: [1, 1],
    });
    expect(serialized.StateTransitions?.[0]?.Actions?.[0]?.$NodeId).toMatch(/^Action-1-/);
  });

  test("parses StateTransitions mappings without node ids next to component-reference actions", () => {
    const context = getNpcBehaviorContext("StateTransitions");
    const state = parseDocumentText(
      JSON.stringify({
        StateTransitions: [
          {
            States: [
              {
                From: ["Idle"],
                To: ["Sleep"],
              },
            ],
            Actions: {
              Reference: "Component_ActionList_Sleep",
            },
          },
        ],
      }),
      context,
    );

    const mappingNode = state.nodes.find(
      node => node.type === "datanode" && node.data.templateId === "Structural.StateTransitionMappingNode",
    );
    const transitionNode = state.nodes.find(
      node => node.type === "datanode" && node.data.templateId === "Structural.StateTransitionNode",
    );
    expect(mappingNode).toBeDefined();
    expect(transitionNode).toBeDefined();
    expect(mappingNode?.data.fieldsBySchemaKey.From.value).toEqual(["Idle"]);
    expect(mappingNode?.data.fieldsBySchemaKey.To.value).toEqual(["Sleep"]);
    expect(state.edges).toContainEqual(
      expect.objectContaining({
        source: mappingNode?.id,
        target: transitionNode?.id,
        targetHandle: "States",
      }),
    );

    const serialized = serializeWorkspaceState(state, context.rootMenuName);

    expect(serialized.StateTransitions?.[0]?.States).toHaveLength(1);
    expect(serialized.StateTransitions?.[0]?.States?.[0]).toMatchObject({
      From: ["Idle"],
      To: ["Sleep"],
    });
    expect(serialized.StateTransitions?.[0]?.Actions).toMatchObject({
      Reference: "Component_ActionList_Sleep",
    });
  });

  test("adapts the Instructions root between host value and graph document root while preserving $ metadata", () => {
    const context = getNpcBehaviorContext("Instructions");

    const adaptedRoot = adaptGraphHostValueToDocumentRoot(
      [{ $NodeId: "Instruction-1", Name: "First" }],
      context,
      {
        $NodeId: "InstructionListRoot-1",
        $NodeEditorMetadata: {
          $WorkspaceID: "NPC Behavior",
        },
        Ignored: "nope",
      },
    );

    expect(adaptedRoot).toEqual({
      $NodeId: "InstructionListRoot-1",
      $NodeEditorMetadata: {
        $WorkspaceID: "NPC Behavior",
      },
      Instructions: [{ $NodeId: "Instruction-1", Name: "First" }],
    });

    expect(adaptGraphDocumentRootToHostValue(adaptedRoot, context)).toEqual({
      value: [{ $NodeId: "Instruction-1", Name: "First" }],
      preservedData: {
        $NodeId: "InstructionListRoot-1",
        $NodeEditorMetadata: {
          $WorkspaceID: "NPC Behavior",
        },
      },
    });
  });

  test("adapts the ActionList root between host value arrays and graph document roots", () => {
    const context = getNpcBehaviorContext("ActionList");

    const adaptedRoot = adaptGraphHostValueToDocumentRoot(
      [{ $NodeId: "Action-1", Type: "Nothing" }],
      context,
    );

    expect(adaptedRoot).toEqual({
      Actions: [{ $NodeId: "Action-1", Type: "Nothing" }],
    });
    expect(adaptGraphDocumentRootToHostValue(adaptedRoot, context)).toEqual({
      value: [{ $NodeId: "Action-1", Type: "Nothing" }],
    });
  });

  test("round-trips position sensor wrapper chains through reverse-authored wrapper inputs", () => {
    const context = getNpcBehaviorContext("Instruction");
    const serialized = expectSemanticRoundTrip(
      {
        $NodeId: "Instruction-1",
        Name: "Land",
        Sensor: {
          $NodeId: "Sensor-1",
          Type: "And",
          Sensors: [
            {
              $NodeId: "Sensor-2",
              Type: "BlockType",
              BlockSet: "Empty",
              Sensor: {
                $NodeId: "Sensor-3",
                Type: "AdjustPosition",
                Offsets: [0, -1, 0],
                Sensor: {
                  $NodeId: "Sensor-4",
                  Type: "Block",
                  RelativeTo: "Self",
                },
              },
            },
          ],
        },
      },
      context,
    );

    expect(serialized.Sensor).toMatchObject({
      Type: "And",
      Sensors: [
        {
          Type: "BlockType",
          Sensor: {
            Type: "AdjustPosition",
            Sensor: {
              Type: "Block",
            },
          },
        },
      ],
    });
  });
});
