import path from "node:path";

import { describe, expect, test } from "vitest";

import { WorkspaceRuntime } from "../../src/node-editor/workspaceResolver";
import { SchemaRuntime } from "../../src/schema/schemaLoader";
import { serializeGraphDocument } from "../../src/shared/node-editor/graphDocument";
import type {
  DataGraphNode,
  NodeEditorGraphDocument,
} from "../../src/shared/node-editor/graphTypes";
import type { NodeEditorWorkspaceContext } from "../../src/shared/node-editor/workspaceTypes";
import { resolveNpcGraphDocumentFromText } from "../../src/shared/npc-role-editor/graphDocumentRuntime";
import { adaptGraphDocumentRootToHostValue } from "../../src/shared/npc-role-editor/graphRootAdapter";
import { canonicalizeJson, parseJsonText, readTestDataText } from "./helpers";

const schemaDir = path.resolve(process.cwd(), "default-data/export-data/schemas");
const workspacesRootPath = path.resolve(process.cwd(), "default-data/node-editor-workspace-definitions");
const fixtureRelativePath =
  "npc-role-editor/Server/NPC/Roles/_Core/Templates/Template_Animal_Neutral.json";

const logger = {
  error() {},
  warn() {},
  info() {},
  debug() {},
};

const editorMetadataKeys = new Set([
  "$Groups",
  "$NodeEditorMetadata",
  "$NodeId",
  "$Position",
  "$Title",
]);

function createStateTransitionsContext(): NodeEditorWorkspaceContext {
  const schemaRuntime = new SchemaRuntime(schemaDir, logger);
  const workspaceRuntime = new WorkspaceRuntime(workspacesRootPath, schemaRuntime, logger);
  const context = workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot(
    "NPC Behavior",
    "StateTransitions",
  );

  expect(context).toBeDefined();
  return context!;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecordArray(value: unknown, label: string): Record<string, unknown>[] {
  expect(Array.isArray(value), `${label} should be an array`).toBe(true);
  const array = value as unknown[];
  for (const item of array) {
    expect(isRecord(item), `${label} entries should be objects`).toBe(true);
  }
  return array as Record<string, unknown>[];
}

function getDataNodesByTemplate(
  graph: NodeEditorGraphDocument,
  templateId: string,
): DataGraphNode[] {
  return graph.nodes.filter(
    (node): node is DataGraphNode =>
      node.type === "datanode" && node.data.templateId === templateId,
  );
}

function sortByInputConnectionIndex(nodes: DataGraphNode[]): DataGraphNode[] {
  return [...nodes].sort(
    (left, right) =>
      (left.data.inputConnectionIndex ?? 0) - (right.data.inputConnectionIndex ?? 0),
  );
}

function getFieldValue(node: DataGraphNode, schemaKey: string): unknown {
  return node.data.fieldsBySchemaKey[schemaKey]?.value;
}

function stripEditorMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => stripEditorMetadata(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !editorMetadataKeys.has(key))
        .map(([key, childValue]) => [key, stripEditorMetadata(childValue)]),
    );
  }

  return value;
}

describe("NPC StateTransitions graph fixture parsing", () => {
  test("parses Template_Animal_Neutral state mappings through the NPC graph entrypoint", () => {
    const text = readTestDataText(fixtureRelativePath);
    const document = parseJsonText(text);
    expect(isRecord(document)).toBe(true);

    const transitions = asRecordArray(
      (document as Record<string, unknown>).StateTransitions,
      "StateTransitions",
    );
    const expectedMappingsByTransition = transitions.map((transition, index) =>
      asRecordArray(transition.States, `StateTransitions[${index}].States`),
    );
    const expectedMappings = expectedMappingsByTransition.flat();

    expect(transitions).toHaveLength(5);
    expect(expectedMappings).toHaveLength(5);

    const workspaceContext = createStateTransitionsContext();
    const graph = resolveNpcGraphDocumentFromText({
      text,
      fieldPath: "StateTransitions",
      workspaceContext,
    });

    const transitionNodes = sortByInputConnectionIndex(
      getDataNodesByTemplate(graph, "Structural.StateTransitionNode"),
    );
    const mappingNodes = getDataNodesByTemplate(
      graph,
      "Structural.StateTransitionMappingNode",
    );
    const mappingNodesById = new Map(mappingNodes.map(node => [node.id, node]));

    expect(transitionNodes).toHaveLength(5);
    expect(mappingNodes).toHaveLength(5);

    transitionNodes.forEach((transitionNode, transitionIndex) => {
      const expectedTransitionMappings = expectedMappingsByTransition[transitionIndex];
      const mappingEdges = graph.edges
        .filter(edge => edge.target === transitionNode.id && edge.targetHandle === "States")
        .sort((left, right) => {
          const leftNode = mappingNodesById.get(left.source);
          const rightNode = mappingNodesById.get(right.source);
          return (
            (leftNode?.data.inputConnectionIndex ?? 0) -
            (rightNode?.data.inputConnectionIndex ?? 0)
          );
        });

      expect(mappingEdges).toHaveLength(expectedTransitionMappings.length);

      mappingEdges.forEach((edge, mappingIndex) => {
        expect(edge.sourceHandle).toBe("Output");

        const mappingNode = mappingNodesById.get(edge.source);
        expect(mappingNode).toBeDefined();

        const expectedMapping = expectedTransitionMappings[mappingIndex];
        expect(getFieldValue(mappingNode!, "From")).toEqual(expectedMapping.From);
        expect(getFieldValue(mappingNode!, "To")).toEqual(expectedMapping.To);
      });
    });

    const expectedReferences = transitions
      .slice(0, 2)
      .map(transition => (transition.Actions as Record<string, unknown>).Reference);
    transitionNodes.slice(0, 2).forEach((transitionNode, index) => {
      const actionEdges = graph.edges.filter(
        edge => edge.source === transitionNode.id && edge.sourceHandle === "Actions",
      );
      expect(actionEdges).toHaveLength(1);

      const actionNode = graph.nodes.find(
        (node): node is DataGraphNode =>
          node.id === actionEdges[0].target && node.type === "datanode",
      );
      expect(actionNode).toBeDefined();
      expect(actionNode!.data.templateId).toBe("Action.ActionListReference");
      expect(actionNode!.data.isComponentReference).toBe(true);
      expect(actionNode!.data.slotOccupancy).toBe("whole-slot");
      expect(getFieldValue(actionNode!, "Reference")).toBe(expectedReferences[index]);
    });

    const serializedRoot = serializeGraphDocument(graph);
    const roundTrip = adaptGraphDocumentRootToHostValue(serializedRoot, workspaceContext);

    expect(canonicalizeJson(stripEditorMetadata(roundTrip.value))).toEqual(
      canonicalizeJson(stripEditorMetadata(transitions)),
    );
  });
});
