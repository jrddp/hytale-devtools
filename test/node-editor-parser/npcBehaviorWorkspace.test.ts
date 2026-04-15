import path from "node:path";
import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { WorkspaceRuntime } from "../../src/node-editor/workspaceResolver";
import { SchemaRuntime } from "../../src/schema/schemaLoader";
import type { NpcDescriptorDocument } from "../../src/shared/npc-role-editor/descriptorTypes";
import type { NodeEditorWorkspaceContext } from "../../src/shared/node-editor/workspaceTypes";
import {
  adaptGraphDocumentRootToHostValue,
  adaptGraphHostValueToDocumentRoot,
} from "../../src/shared/node-editor/graphDocument";
import {
  NPC_BEHAVIOR_CHILD_DOMAIN_DEFINITIONS,
  NPC_BEHAVIOR_CONNECTION_DEFINITIONS,
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

function getNpcBehaviorContext(rootId: "Instructions" | "Instruction" | "Sensor"): NodeEditorWorkspaceContext {
  const workspaceRuntime = createWorkspaceRuntime();
  const workspace = workspaceRuntime.nodeEditorWorkspaces["NPC Behavior"];
  expect(workspace).toBeDefined();

  const root = workspace.roots[rootId];
  expect(root).toBeDefined();

  return {
    nodeTemplatesById: workspace.nodeTemplatesById,
    variantKindsById: workspace.variantKindsById,
    templateCategories: workspace.templateCategories,
    rootTemplateOrVariantId: root.RootNodeType,
    rootMenuName: root.MenuName,
  };
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

    expect(Object.keys(workspace.roots).sort()).toEqual(["Instruction", "Instructions", "Sensor"]);
    expect(workspace.roots.Instruction.RootNodeType).toBe("Structural.InstructionNode");
    expect(workspace.roots.Instructions.RootNodeType).toBe("Structural.InstructionListRoot");
    expect(workspace.roots.Sensor.RootNodeType).toBe("SensorVariants");

    expect(workspace.nodeTemplatesById["Structural.InstructionNode"]).toBeDefined();
    expect(
      workspace.nodeTemplatesById["Structural.InstructionListRoot"].childSchemas.Instructions
        ?.serializationType,
    ).toBe("root");
    expect(
      workspace.nodeTemplatesById["Structural.InstructionNode"].inputPins.some(
        pin => pin.schemaKey === "Sensor",
      ),
    ).toBe(true);
    expect(
      workspace.nodeTemplatesById["Sensor.Any"].outputPins.some(
        pin => pin.localId === "Output" && pin.connectionType === "Sensor",
      ),
    ).toBe(true);
    expect(
      workspace.nodeTemplatesById["IEntityFilter.LineOfSight"].outputPins.some(
        pin => pin.localId === "Output" && pin.connectionType === "IEntityFilter",
      ),
    ).toBe(true);
    expect(workspace.nodeTemplatesById["Structural.InstructionNode"].fieldsBySchemaKey.Enabled?.computable).toBe(true);
    expect(workspace.nodeTemplatesById["Structural.InstructionNode"].fieldsBySchemaKey.Weight?.computable).toBe(true);
    expect(workspace.nodeTemplatesById["Sensor.Target"].fieldsBySchemaKey.Range?.computable).toBe(true);
    expect(workspace.nodeTemplatesById["Sensor.Target"].fieldsBySchemaKey.TargetSlot?.computable).toBe(true);
    expect(workspace.nodeTemplatesById["Action.Timeout"]).toBeDefined();
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
      workspace.nodeTemplatesById["WeightedAction.WeightedAction"].outputPins.some(
        pin => pin.localId === "Output" && pin.connectionType === "WeightedAction",
      ),
    ).toBe(true);
    expect(
      workspace.nodeTemplatesById["ValueToParameterMapping.ValueToParameterMapping"].outputPins.some(
        pin => pin.localId === "Output" && pin.connectionType === "ValueToParameterMapping",
      ),
    ).toBe(true);
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
    const instructionNode = workspace.nodeTemplatesById["Structural.InstructionNode"];
    if (!instructionNode) {
      throw new Error("Expected generated template Structural.InstructionNode.");
    }

    for (const attribute of mergeAttributes(instructionDescriptors)) {
      const domain = getNpcBehaviorChildDomain(
        attribute.Type,
        typeof attribute.Domain === "string" ? attribute.Domain : undefined,
      );
      if (!domain) {
        continue;
      }

      mappedDomains.add(domain);
      const mapping = NPC_BEHAVIOR_CHILD_DOMAIN_DEFINITIONS[domain];
      expect(mapping, `Instruction.${attribute.Name}`).toBeDefined();
      const expectedConnectionType = getNpcBehaviorChildConnectionType(
        "Structural",
        "Instruction",
        attribute.Name,
        domain,
      );
      expect(expectedConnectionType, `Instruction.${attribute.Name}`).toBeDefined();

      const expectedSide = getNpcBehaviorChildPinSide(
        "Structural",
        "Instruction",
        attribute.Name,
        domain,
      );
      const actualPin =
        expectedSide === "input"
          ? instructionNode.inputPins.find(pin => pin.schemaKey === attribute.Name)
          : instructionNode.outputPins.find(pin => pin.schemaKey === attribute.Name);

      expect(actualPin, `Instruction.${attribute.Name}`).toBeDefined();
      expect(actualPin?.connectionType).toBe(expectedConnectionType);
      expect(actualPin?.color).toBe(getNpcBehaviorConnectionColor(expectedConnectionType!));
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
        pin => pin.connectionType === "Instruction" && pin.label === "Instruction",
      ),
    ).toBe(true);
    expect(
      instructionNode.inputPins.some(pin => pin.schemaKey === "Sensor" && pin.connectionType === "Sensor"),
    ).toBe(true);

    const targetSensor = workspace.nodeTemplatesById["Sensor.Target"];
    expect(
      targetSensor.inputPins.some(
        pin => pin.connectionType === "WrappedSensor" && pin.label === "Wrapped Sensor",
      ),
    ).toBe(true);
    expect(
      targetSensor.inputPins.some(pin => pin.schemaKey === "Filters" && pin.connectionType === "IEntityFilter"),
    ).toBe(true);
    expect(
      targetSensor.outputPins.some(pin => pin.localId === "Output" && pin.connectionType === "Sensor"),
    ).toBe(true);

    const anySensor = workspace.nodeTemplatesById["Sensor.Any"];
    expect(anySensor.inputPins.some(pin => pin.connectionType === "WrappedSensor")).toBe(true);
    expect(anySensor.outputPins.some(pin => pin.localId === "Output" && pin.connectionType === "Sensor")).toBe(true);

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
      valueProviderWrapper.outputPins.some(
        pin => pin.schemaKey === "Sensor" && pin.connectionType === "WrappedSensor",
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
    expect(weightedAction.inputPins.length).toBe(0);
    expect(
      weightedAction.outputPins.some(
        pin => pin.localId === "Output" && pin.connectionType === "WeightedAction",
      ),
    ).toBe(true);
    expect(
      weightedAction.outputPins.some(pin => pin.schemaKey === "Action" && pin.connectionType === "Action"),
    ).toBe(true);

    const instructionsRoot = workspace.nodeTemplatesById["Structural.InstructionListRoot"];
    expect(instructionsRoot.inputPins.length).toBe(0);
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
        Enabled: { Compute: "isEmpty(TargetSlot)" },
        Weight: { Compute: "randomInRange(1, 3)" },
        Sensor: {
          $NodeId: "Sensor-1",
          Type: "Target",
          TargetSlot: { Compute: "TargetParameter" },
          Range: { Compute: "randomInRange(5, 10)" },
        },
      },
      context,
    );

    expect(serialized.Enabled).toEqual({ Compute: "isEmpty(TargetSlot)" });
    expect(serialized.Weight).toEqual({ Compute: "randomInRange(1, 3)" });
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
                $NodeId: "Instruction-3",
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
});
