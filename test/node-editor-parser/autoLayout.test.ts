import { describe, expect, test } from "vitest";

import type { FlowEdge, FlowNode } from "../../webview/hytale-node-editor/src/common";
import { getAutoPositionNodeUpdates } from "../../webview/hytale-node-editor/src/node-editor/layout/autoLayout";
import { createNodeEditorSession } from "../../webview/hytale-node-editor/src/workspace.svelte";
import { nodeTemplate } from "./helpers";

function createDataNode(
  id: string,
  templateId: string,
  position: { x: number; y: number },
): FlowNode {
  return {
    id,
    type: "datanode",
    position,
    measured: {
      width: 220,
      height: 120,
    },
    data: nodeTemplate(templateId),
  } as FlowNode;
}

function createEdge(
  id: string,
  source: string,
  target: string,
  sourceHandle = "output",
  targetHandle = "input",
): FlowEdge {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
  } as FlowEdge;
}

function applyUpdates(nodes: FlowNode[], updates: ReturnType<typeof getAutoPositionNodeUpdates>): Map<string, FlowNode> {
  const byId = new Map(nodes.map(node => [node.id, structuredClone(node)]));
  for (const [nodeId, update] of updates) {
    const node = byId.get(nodeId);
    if (!node) {
      continue;
    }

    byId.set(nodeId, {
      ...node,
      ...update,
      data: update.data ? { ...node.data, ...update.data } : node.data,
    });
  }
  return byId;
}

describe("node editor auto layout", () => {
  test("lays out mixed upstream and downstream graph branches around the selected instruction node", () => {
    const session = createNodeEditorSession();

    const block = createDataNode("block", "Sensor.Block", { x: 0, y: 0 });
    const beacon = createDataNode("beacon", "Sensor.Beacon", { x: 0, y: 140 });
    const adjustPosition = createDataNode("adjust", "Sensor.AdjustPosition", { x: 0, y: 280 });
    const blockType = createDataNode("blockType", "Sensor.BlockType", { x: 0, y: 420 });
    const andNode = createDataNode("and", "Sensor.And", { x: 0, y: 560 });
    const instruction = createDataNode("instruction", "Structural.InstructionNode", {
      x: 900,
      y: 200,
    });
    const action = createDataNode("action", "Action.Nothing", { x: 1100, y: 200 });

    session.nodes = [block, beacon, adjustPosition, blockType, andNode, instruction, action];
    session.edges = [
      createEdge("block->adjust", "block", "adjust", "output", "Sensor"),
      createEdge("adjust->blockType", "adjust", "blockType", "output", "Sensor"),
      createEdge("blockType->and", "blockType", "and", "output", "Sensors"),
      createEdge("beacon->and", "beacon", "and", "output", "Sensors"),
      createEdge("and->instruction", "and", "instruction", "output", "Sensor"),
      createEdge("instruction->action", "instruction", "action", "Actions", "input"),
    ];

    const updates = getAutoPositionNodeUpdates([instruction], session);
    const positionedNodes = applyUpdates(session.nodes, updates);

    const getX = (nodeId: string) => {
      const node = positionedNodes.get(nodeId);
      if (!node) {
        throw new Error(`Missing node ${nodeId}.`);
      }
      return node.position.x;
    };

    expect(getX("block")).toBeLessThan(getX("adjust"));
    expect(getX("adjust")).toBeLessThan(getX("blockType"));
    expect(getX("blockType")).toBeLessThan(getX("and"));
    expect(getX("beacon")).toBeLessThan(getX("and"));
    expect(getX("and")).toBeLessThan(getX("instruction"));
    expect(getX("instruction")).toBeLessThan(getX("action"));
    expect(getX("instruction")).toBe(900);
  });
});
