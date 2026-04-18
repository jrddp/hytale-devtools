import { describe, expect, test } from "vitest";
import type { ConnectionState } from "@xyflow/system";

import type { FlowEdge, FlowNode } from "../../webview/hytale-node-editor/src/common";
import { createConnectionPreviewController } from "../../webview/hytale-node-editor/src/node-editor/utils/connectionPreview.svelte";
import { collectConflictingEdges } from "../../webview/hytale-node-editor/src/node-editor/utils/nodeUtils.svelte";
import { createNodeEditorSession } from "../../webview/hytale-node-editor/src/workspace.svelte";
import { inputPin, nodeTemplate, outputPin } from "./helpers";

function createDataNode(
  id: string,
  {
    inputPins = [],
    outputPins = [],
  }: {
    inputPins?: ReturnType<typeof inputPin>[];
    outputPins?: ReturnType<typeof outputPin>[];
  } = {},
): FlowNode {
  return {
    id,
    type: "datanode",
    position: { x: 0, y: 0 },
    data: nodeTemplate(id, {
      inputPins,
      outputPins,
    }),
  } as FlowNode;
}

function createEdge(
  id: string,
  source: string,
  target: string,
  sourceHandle = "Output",
  targetHandle = "Input",
): FlowEdge {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
  } as FlowEdge;
}

function validHover(target: string, targetHandle = "Input"): ConnectionState {
  return {
    inProgress: true,
    isValid: true,
    toNode: { id: target },
    toHandle: { id: targetHandle },
  } as ConnectionState;
}

function invalidHover(): ConnectionState {
  return {
    inProgress: true,
    isValid: false,
  } as ConnectionState;
}

describe("node editor connection preview pruning", () => {
  test("collects all conflicting incoming edges for a single target handle", () => {
    const session = createNodeEditorSession();
    session.nodes = [
      createDataNode("sourceA", { outputPins: [outputPin("Output", "single")] }),
      createDataNode("sourceB", { outputPins: [outputPin("Output", "single")] }),
      createDataNode("target", { inputPins: [inputPin("Input", "single")] }),
    ];
    session.edges = [
      createEdge("edge-a", "sourceA", "target"),
      createEdge("edge-b", "sourceB", "target"),
    ];

    expect(
      collectConflictingEdges(
        {
          source: "sourceA",
          sourceHandle: "Output",
          target: "target",
          targetHandle: "Input",
        },
        session,
      ).map(edge => edge.id),
    ).toEqual(["edge-a", "edge-b"]);
  });

  test("prunes existing outgoing edges immediately when dragging from a single output", () => {
    const session = createNodeEditorSession();
    session.nodes = [
      createDataNode("source", { outputPins: [outputPin("Output", "single")] }),
      createDataNode("target", { inputPins: [inputPin("Input", "single")] }),
    ];
    session.edges = [createEdge("old-edge", "source", "target")];

    const controller = createConnectionPreviewController(session);
    controller.beginSourceDrag("source", "Output");

    expect(session.edges).toEqual([]);

    controller.cancel();
    expect(session.edges.map(edge => edge.id)).toEqual(["old-edge"]);
  });

  test("prunes existing incoming edges immediately when dragging from a single input", () => {
    const session = createNodeEditorSession();
    session.nodes = [
      createDataNode("source", { outputPins: [outputPin("Output", "single")] }),
      createDataNode("target", { inputPins: [inputPin("Input", "single")] }),
    ];
    session.edges = [createEdge("old-edge", "source", "target")];

    const controller = createConnectionPreviewController(session);
    controller.beginTargetDrag("target", "Input");

    expect(session.edges).toEqual([]);

    controller.cancel();
    expect(session.edges.map(edge => edge.id)).toEqual(["old-edge"]);
  });

  test("keeps fixed-end pruning while restoring hovered target conflicts when the hover changes", () => {
    const session = createNodeEditorSession();
    session.nodes = [
      createDataNode("source", { outputPins: [outputPin("Output", "single")] }),
      createDataNode("oldTarget", { inputPins: [inputPin("Input", "single")] }),
      createDataNode("otherSourceA", { outputPins: [outputPin("Output", "single")] }),
      createDataNode("otherSourceB", { outputPins: [outputPin("Output", "single")] }),
      createDataNode("hoverA", { inputPins: [inputPin("Input", "single")] }),
      createDataNode("hoverB", { inputPins: [inputPin("Input", "single")] }),
    ];
    session.edges = [
      createEdge("source-old", "source", "oldTarget"),
      createEdge("hover-a-old", "otherSourceA", "hoverA"),
      createEdge("hover-b-old", "otherSourceB", "hoverB"),
    ];

    const controller = createConnectionPreviewController(session);
    controller.beginSourceDrag("source", "Output");
    expect(session.edges.map(edge => edge.id)).toEqual(["hover-a-old", "hover-b-old"]);

    controller.updateHover(validHover("hoverA"));
    expect(session.edges.map(edge => edge.id)).toEqual(["hover-b-old"]);

    controller.updateHover(validHover("hoverB"));
    expect(session.edges.map(edge => edge.id)).toEqual(["hover-a-old"]);

    controller.updateHover(invalidHover());
    expect(session.edges.map(edge => edge.id)).toEqual(["hover-a-old", "hover-b-old"]);

    controller.cancel();
    expect(session.edges.map(edge => edge.id)).toEqual(["source-old", "hover-a-old", "hover-b-old"]);
  });

  test("commits direct connections with only the replacement edge on constrained handles", () => {
    const session = createNodeEditorSession();
    session.nodes = [
      createDataNode("source", { outputPins: [outputPin("Output", "single")] }),
      createDataNode("oldTarget", { inputPins: [inputPin("Input", "single")] }),
      createDataNode("otherSource", { outputPins: [outputPin("Output", "single")] }),
      createDataNode("newTarget", { inputPins: [inputPin("Input", "single")] }),
    ];
    session.edges = [
      createEdge("source-old", "source", "oldTarget"),
      createEdge("target-old", "otherSource", "newTarget"),
    ];

    const controller = createConnectionPreviewController(session);
    controller.beginSourceDrag("source", "Output");
    controller.updateHover(validHover("newTarget"));

    session.addEdges([
      {
        id: "replacement",
        source: "source",
        sourceHandle: "Output",
        target: "newTarget",
        targetHandle: "Input",
      } as FlowEdge,
    ]);
    controller.commit();

    expect(session.edges.map(edge => edge.id)).toEqual(["replacement"]);
  });

  test("commits add-menu replacement from a single output without restoring the old edge", () => {
    const session = createNodeEditorSession();
    session.nodes = [
      createDataNode("source", { outputPins: [outputPin("Output", "single")] }),
      createDataNode("oldTarget", { inputPins: [inputPin("Input", "single")] }),
      createDataNode("newNode", { inputPins: [inputPin("Input", "single")] }),
    ];
    session.edges = [createEdge("old-edge", "source", "oldTarget")];

    const controller = createConnectionPreviewController(session);
    controller.beginSourceDrag("source", "Output");
    controller.previewFixedConflicts();

    session.addEdges([
      {
        id: "replacement",
        source: "source",
        sourceHandle: "Output",
        target: "newNode",
        targetHandle: "Input",
      } as FlowEdge,
    ]);
    controller.commit();

    expect(session.edges.map(edge => edge.id)).toEqual(["replacement"]);
  });

  test("does not prune handles with multiple multiplicity", () => {
    const session = createNodeEditorSession();
    session.nodes = [
      createDataNode("source", { outputPins: [outputPin("Output", "multiple")] }),
      createDataNode("target", { inputPins: [inputPin("Input", "multiple")] }),
    ];
    session.edges = [createEdge("old-edge", "source", "target")];

    const controller = createConnectionPreviewController(session);
    controller.beginSourceDrag("source", "Output");
    expect(session.edges.map(edge => edge.id)).toEqual(["old-edge"]);

    controller.cancel();
    controller.beginTargetDrag("target", "Input");
    expect(session.edges.map(edge => edge.id)).toEqual(["old-edge"]);
  });
});
