import path from "node:path";

import { describe, expect, test } from "vitest";

import { WorkspaceRuntime } from "../../src/node-editor/workspaceResolver";
import { SchemaRuntime } from "../../src/schema/schemaLoader";
import type { NodeEditorWorkspaceContext } from "../../src/shared/node-editor/workspaceTypes";
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
    expect(workspace.nodeTemplatesById["Action.Timeout"]).toBeDefined();
    expect(workspace.nodeTemplatesById["WeightedAction.WeightedAction"]).toBeDefined();
    expect(workspace.nodeTemplatesById["Path.Path"]).toBeDefined();
    expect(workspace.nodeTemplatesById["RelativeWaypointDefinition.RelativeWaypointDefinition"]).toBeDefined();
    expect(workspace.nodeTemplatesById["ValueToParameterMapping.ValueToParameterMapping"]).toBeDefined();
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
});
