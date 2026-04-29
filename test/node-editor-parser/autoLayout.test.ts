import { describe, expect, test } from "vitest";

import type { FlowEdge, FlowNode } from "../../webview/hytale-node-editor/src/common";
import { getAutoPositionNodeUpdates } from "../../webview/hytale-node-editor/src/node-editor/layout/autoLayout";
import { createNodeEditorSession } from "../../webview/hytale-node-editor/src/workspace.svelte";
import { inputPin, nodeTemplate, outputPin, selfOutputPin } from "./helpers";

function createDataNode(
  id: string,
  templateId: string,
  position: { x: number; y: number },
  templateOverrides: Parameters<typeof nodeTemplate>[1] = {},
): FlowNode {
  return {
    id,
    type: "datanode",
    position,
    measured: {
      width: 220,
      height: 120,
    },
    data: nodeTemplate(templateId, templateOverrides),
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

function applyUpdates(
  nodes: FlowNode[],
  updates: Awaited<ReturnType<typeof getAutoPositionNodeUpdates>>,
): Map<string, FlowNode> {
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
  test("lays out mixed upstream and downstream graph branches around the selected instruction node", async () => {
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

    const updates = await getAutoPositionNodeUpdates([instruction], session);
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

  test("respects target input pin order even when incoming edges are provided in reverse order", async () => {
    const session = createNodeEditorSession();

    const sensor = createDataNode("sensor", "Sensor.Any", { x: 200, y: 400 }, {
      outputPins: [selfOutputPin("Sensor")],
    });
    const parentInstruction = createDataNode(
      "parentInstruction",
      "Structural.InstructionNode",
      {
        x: 200,
        y: 40,
      },
      {
        outputPins: [outputPin("Instructions", "multiple", { connectionType: "Instruction" })],
      },
    );
    const instruction = createDataNode("instruction", "Structural.InstructionNode", {
      x: 900,
      y: 200,
    }, {
      inputPins: [
        inputPin("Sensor", "single", { connectionType: "Sensor", label: "Sensor" }),
        inputPin("Input", "single", { connectionType: "Instruction", label: "Instruction" }),
      ],
    });

    session.nodes = [sensor, parentInstruction, instruction];
    session.edges = [
      createEdge(
        "parent->instruction",
        "parentInstruction",
        "instruction",
        "Instructions",
        "Input",
      ),
      createEdge("sensor->instruction", "sensor", "instruction", "Output", "Sensor"),
    ];

    const updates = await getAutoPositionNodeUpdates([instruction], session);
    const positionedNodes = applyUpdates(session.nodes, updates);

    const sensorY = positionedNodes.get("sensor")?.position.y;
    const parentY = positionedNodes.get("parentInstruction")?.position.y;

    expect(sensorY).toBeTypeOf("number");
    expect(parentY).toBeTypeOf("number");
    expect(sensorY!).toBeLessThan(parentY!);
  });

  test("keeps the root wrapper above competing sensor branches in the same predecessor rank", async () => {
    const session = createNodeEditorSession();

    const root = createDataNode(
      "root",
      "Structural.InstructionListRoot",
      { x: 40, y: 220 },
      {
        outputPins: [
          outputPin("Instructions", "multiple", {
            connectionType: "Instruction",
            label: "Instructions",
          }),
        ],
      },
    );
    const sensor = createDataNode("sensor", "Sensor.Any", { x: 40, y: 40 }, {
      outputPins: [selfOutputPin("Sensor")],
    });
    const instruction = createDataNode(
      "instruction",
      "Structural.InstructionNode",
      { x: 900, y: 200 },
      {
        inputPins: [
          inputPin("Sensor", "single", { connectionType: "Sensor", label: "Sensor" }),
          inputPin("Input", "single", { connectionType: "Instruction", label: "Instruction" }),
        ],
      },
    );

    session.nodes = [root, sensor, instruction];
    session.edges = [
      createEdge("root->instruction", "root", "instruction", "Instructions", "Input"),
      createEdge("sensor->instruction", "sensor", "instruction", "Output", "Sensor"),
    ];
    session.rootNodeId = "root";

    const updates = await getAutoPositionNodeUpdates([instruction], session);
    const positionedNodes = applyUpdates(session.nodes, updates);

    const rootY = positionedNodes.get("root")?.position.y;
    const sensorY = positionedNodes.get("sensor")?.position.y;

    expect(rootY).toBeTypeOf("number");
    expect(sensorY).toBeTypeOf("number");
    expect(rootY!).toBeLessThan(sensorY!);
  });

  test("places child instructions after the parent instruction's full local support group", async () => {
    const session = createNodeEditorSession();

    const block = createDataNode("block", "Sensor.Block", { x: 0, y: 0 }, {
      outputPins: [selfOutputPin("PositionSensor")],
    });
    const adjustPosition = createDataNode("adjust", "Sensor.AdjustPosition", { x: 0, y: 140 }, {
      inputPins: [inputPin("Sensor", "single", { connectionType: "PositionSensor", label: "Sensor" })],
      outputPins: [selfOutputPin("PositionSensor")],
    });
    const blockType = createDataNode("blockType", "Sensor.BlockType", { x: 0, y: 280 }, {
      inputPins: [inputPin("Sensor", "single", { connectionType: "PositionSensor", label: "Sensor" })],
      outputPins: [selfOutputPin("PositionSensor")],
    });
    const sensorAnd = createDataNode("and", "Sensor.And", { x: 0, y: 420 }, {
      inputPins: [inputPin("Sensors", "multiple", { connectionType: "Sensor", label: "Sensors" })],
      outputPins: [selfOutputPin("Sensor")],
    });
    const instruction = createDataNode("instruction", "Structural.InstructionNode", { x: 500, y: 200 }, {
      inputPins: [
        inputPin("Sensor", "single", { connectionType: "Sensor", label: "Sensor" }),
        inputPin("Instruction", "single", { connectionType: "Instruction", label: "Instruction" }),
      ],
      outputPins: [outputPin("Instructions", "multiple", { connectionType: "Instruction" })],
    });
    const childInstruction = createDataNode("child", "Structural.InstructionNode", { x: 900, y: 200 }, {
      inputPins: [
        inputPin("Sensor", "single", { connectionType: "Sensor", label: "Sensor" }),
        inputPin("Instruction", "single", { connectionType: "Instruction", label: "Instruction" }),
      ],
    });

    session.nodes = [block, adjustPosition, blockType, sensorAnd, instruction, childInstruction];
    session.edges = [
      createEdge("block->adjust", "block", "adjust", "Output", "Sensor"),
      createEdge("adjust->blockType", "adjust", "blockType", "Output", "Sensor"),
      createEdge("blockType->and", "blockType", "and", "Output", "Sensors"),
      createEdge("and->instruction", "and", "instruction", "Output", "Sensor"),
      createEdge("instruction->child", "instruction", "child", "Instructions", "Instruction"),
    ];

    const updates = await getAutoPositionNodeUpdates([instruction], session);
    const positionedNodes = applyUpdates(session.nodes, updates);

    const childX = positionedNodes.get("child")?.position.x;
    const andX = positionedNodes.get("and")?.position.x;
    const blockTypeX = positionedNodes.get("blockType")?.position.x;

    expect(childX).toBeTypeOf("number");
    expect(andX).toBeTypeOf("number");
    expect(blockTypeX).toBeTypeOf("number");
    expect(andX!).toBeLessThan(childX!);
    expect(blockTypeX!).toBeLessThan(childX!);
  });

  test("aligns sibling child instructions by their instruction nodes instead of their full group bounds", async () => {
    const session = createNodeEditorSession();

    const parent = createDataNode("parent", "Structural.InstructionNode", { x: 300, y: 160 }, {
      outputPins: [outputPin("Instructions", "multiple", { connectionType: "Instruction" })],
    });
    const directChild = createDataNode("directChild", "Structural.InstructionNode", { x: 900, y: 0 }, {
      inputPins: [inputPin("Instruction", "single", { connectionType: "Instruction", label: "Instruction" })],
    });
    const sensor = createDataNode("sensor", "Sensor.Target", { x: 700, y: 300 }, {
      outputPins: [selfOutputPin("Sensor")],
    });
    const sensorWrapper = createDataNode("sensorWrapper", "Sensor.Not", { x: 780, y: 300 }, {
      inputPins: [inputPin("Sensor", "single", { connectionType: "Sensor", label: "Sensor" })],
      outputPins: [selfOutputPin("Sensor")],
    });
    const sensorChild = createDataNode("sensorChild", "Structural.InstructionNode", { x: 900, y: 300 }, {
      inputPins: [
        inputPin("Sensor", "single", { connectionType: "Sensor", label: "Sensor" }),
        inputPin("Instruction", "single", { connectionType: "Instruction", label: "Instruction" }),
      ],
    });

    session.nodes = [parent, directChild, sensor, sensorWrapper, sensorChild];
    session.edges = [
      createEdge("parent->directChild", "parent", "directChild", "Instructions", "Instruction"),
      createEdge("parent->sensorChild", "parent", "sensorChild", "Instructions", "Instruction"),
      createEdge("sensor->wrapper", "sensor", "sensorWrapper", "Output", "Sensor"),
      createEdge("wrapper->sensorChild", "sensorWrapper", "sensorChild", "Output", "Sensor"),
    ];

    const updates = await getAutoPositionNodeUpdates([parent], session);
    const positionedNodes = applyUpdates(session.nodes, updates);

    const directChildX = positionedNodes.get("directChild")?.position.x;
    const sensorChildX = positionedNodes.get("sensorChild")?.position.x;
    const sensorX = positionedNodes.get("sensor")?.position.x;
    const sensorWrapperX = positionedNodes.get("sensorWrapper")?.position.x;
    const parentRightX = (positionedNodes.get("parent")?.position.x ?? 0) + 220;

    expect(directChildX).toBeTypeOf("number");
    expect(sensorChildX).toBeTypeOf("number");
    expect(sensorX).toBeTypeOf("number");
    expect(sensorWrapperX).toBeTypeOf("number");
    expect(directChildX).toBe(sensorChildX);
    expect(sensorX!).toBeGreaterThanOrEqual(parentRightX + 100);
    expect(sensorWrapperX!).toBeGreaterThan(sensorX!);
    expect(sensorX!).toBeLessThan(sensorChildX!);
  });

  test("aligns top-level instructions under the root wrapper by their instruction nodes", async () => {
    const session = createNodeEditorSession();

    const root = createDataNode(
      "root",
      "Structural.InstructionListRoot",
      { x: 40, y: 120 },
      {
        outputPins: [
          outputPin("Instructions", "multiple", {
            connectionType: "Instruction",
            label: "Instructions",
          }),
        ],
      },
    );
    const directChild = createDataNode("directChild", "Structural.InstructionNode", { x: 900, y: 0 }, {
      inputPins: [inputPin("Instruction", "single", { connectionType: "Instruction", label: "Instruction" })],
    });
    const sensor = createDataNode("sensor", "Sensor.Target", { x: 700, y: 300 }, {
      outputPins: [selfOutputPin("Sensor")],
    });
    const sensorWrapper = createDataNode("sensorWrapper", "Sensor.Not", { x: 780, y: 300 }, {
      inputPins: [inputPin("Sensor", "single", { connectionType: "Sensor", label: "Sensor" })],
      outputPins: [selfOutputPin("Sensor")],
    });
    const sensorChild = createDataNode("sensorChild", "Structural.InstructionNode", { x: 900, y: 300 }, {
      inputPins: [
        inputPin("Sensor", "single", { connectionType: "Sensor", label: "Sensor" }),
        inputPin("Instruction", "single", { connectionType: "Instruction", label: "Instruction" }),
      ],
    });

    session.nodes = [root, directChild, sensor, sensorWrapper, sensorChild];
    session.edges = [
      createEdge("root->directChild", "root", "directChild", "Instructions", "Instruction"),
      createEdge("root->sensorChild", "root", "sensorChild", "Instructions", "Instruction"),
      createEdge("sensor->wrapper", "sensor", "sensorWrapper", "Output", "Sensor"),
      createEdge("wrapper->sensorChild", "sensorWrapper", "sensorChild", "Output", "Sensor"),
    ];
    session.rootNodeId = "root";

    const updates = await getAutoPositionNodeUpdates([directChild], session);
    const positionedNodes = applyUpdates(session.nodes, updates);

    const directChildX = positionedNodes.get("directChild")?.position.x;
    const sensorChildX = positionedNodes.get("sensorChild")?.position.x;
    const sensorX = positionedNodes.get("sensor")?.position.x;
    const rootRightX = (positionedNodes.get("root")?.position.x ?? 0) + 220;

    expect(directChildX).toBeTypeOf("number");
    expect(sensorChildX).toBeTypeOf("number");
    expect(sensorX).toBeTypeOf("number");
    expect(directChildX).toBe(sensorChildX);
    expect(sensorX!).toBeGreaterThanOrEqual(rootRightX + 100);
    expect(sensorX!).toBeLessThan(sensorChildX!);
  });

  test("uses larger vertical spacing between sibling instruction groups than internal elk node spacing", async () => {
    const session = createNodeEditorSession();

    const parent = createDataNode("parent", "Structural.InstructionNode", { x: 300, y: 160 }, {
      outputPins: [outputPin("Instructions", "multiple", { connectionType: "Instruction" })],
    });
    const upperChild = createDataNode("upperChild", "Structural.InstructionNode", { x: 900, y: 0 }, {
      inputPins: [inputPin("Instruction", "single", { connectionType: "Instruction", label: "Instruction" })],
    });
    const lowerChild = createDataNode("lowerChild", "Structural.InstructionNode", { x: 900, y: 300 }, {
      inputPins: [inputPin("Instruction", "single", { connectionType: "Instruction", label: "Instruction" })],
    });

    session.nodes = [parent, upperChild, lowerChild];
    session.edges = [
      createEdge("parent->upperChild", "parent", "upperChild", "Instructions", "Instruction"),
      createEdge("parent->lowerChild", "parent", "lowerChild", "Instructions", "Instruction"),
    ];

    const updates = await getAutoPositionNodeUpdates([parent], session);
    const positionedNodes = applyUpdates(session.nodes, updates);

    const upperY = positionedNodes.get("upperChild")?.position.y;
    const lowerY = positionedNodes.get("lowerChild")?.position.y;

    expect(upperY).toBeTypeOf("number");
    expect(lowerY).toBeTypeOf("number");
    expect(lowerY! - upperY!).toBeGreaterThan(220);
  });

  test("treats random weighted-instruction entries as child instruction subtrees", async () => {
    const session = createNodeEditorSession();

    const parent = createDataNode("parent", "Structural.InstructionNode", { x: 300, y: 160 }, {
      outputPins: [outputPin("Instructions", "multiple", { connectionType: "Instruction" })],
    });
    const upperChild = createDataNode("upperChild", "Structural.InstructionNode", { x: 900, y: 0 }, {
      inputPins: [inputPin("Input", "single", { connectionType: "Instruction", label: "Instruction" })],
    });
    const random = createDataNode("random", "Structural.RandomInstructionNode", { x: 900, y: 300 }, {
      inputPins: [inputPin("Input", "single", { connectionType: "Instruction", label: "Instruction" })],
      outputPins: [
        outputPin("WeightedInstructions", "multiple", {
          connectionType: "WeightedInstruction",
          label: "Instructions",
        }),
      ],
    });
    const lowerChild = createDataNode("lowerChild", "Structural.InstructionNode", { x: 900, y: 600 }, {
      inputPins: [inputPin("Input", "single", { connectionType: "Instruction", label: "Instruction" })],
    });
    const weighted = createDataNode("weighted", "Structural.WeightedInstruction", { x: 1100, y: 900 }, {
      inputPins: [
        inputPin("Input", "single", {
          connectionType: "WeightedInstruction",
          label: "Weighted Instruction",
        }),
      ],
      outputPins: [outputPin("Instruction", "single", { connectionType: "Instruction" })],
    });
    const nestedChild = createDataNode("nestedChild", "Structural.InstructionNode", { x: 1400, y: 900 }, {
      inputPins: [inputPin("Input", "single", { connectionType: "Instruction", label: "Instruction" })],
    });

    session.nodes = [parent, upperChild, random, lowerChild, weighted, nestedChild];
    session.edges = [
      createEdge("parent->upper", "parent", "upperChild", "Instructions", "Input"),
      createEdge("parent->random", "parent", "random", "Instructions", "Input"),
      createEdge("parent->lower", "parent", "lowerChild", "Instructions", "Input"),
      createEdge("random->weighted", "random", "weighted", "WeightedInstructions", "Input"),
      createEdge("weighted->nested", "weighted", "nestedChild", "Instruction", "Input"),
    ];

    const updates = await getAutoPositionNodeUpdates([parent], session);
    const positionedNodes = applyUpdates(session.nodes, updates);

    const randomNode = positionedNodes.get("random");
    const weightedNode = positionedNodes.get("weighted");
    const nestedNode = positionedNodes.get("nestedChild");
    const lowerNode = positionedNodes.get("lowerChild");

    expect(randomNode?.position.x).toBeTypeOf("number");
    expect(weightedNode?.position.x).toBeTypeOf("number");
    expect(nestedNode?.position.x).toBeTypeOf("number");
    expect(lowerNode?.position.y).toBeTypeOf("number");
    expect(weightedNode!.position.x).toBeGreaterThan(randomNode!.position.x);
    expect(nestedNode!.position.x).toBeGreaterThan(weightedNode!.position.x);
    expect(nestedNode!.position.y).toBeLessThan(lowerNode!.position.y);
  });
});
