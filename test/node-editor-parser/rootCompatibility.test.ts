import { describe, expect, test } from "vitest";

import {
  canNodeBeSetAsWorkspaceRoot,
  getValidTemplatesForTemplateOrVariantId,
  isTemplateCompatibleWithWorkspaceRoot,
} from "@shared/node-editor/rootCompatibility";
import type { NodeEditorGraphDocument } from "@shared/node-editor/graphTypes";
import type { WebviewToExtensionMessage } from "@shared/node-editor/messageTypes";
import type { NodeTemplate } from "@shared/node-editor/workspaceTypes";
import type { FlowNode } from "../../webview/hytale-node-editor/src/common";
import { createNodeEditorSession } from "../../webview/hytale-node-editor/src/workspace.svelte";
import {
  inputPin,
  nodeTemplate,
  outputPin,
  workspaceContext,
} from "./helpers";

function dataNode(id: string, template: NodeTemplate): FlowNode {
  return {
    id,
    type: "datanode",
    position: { x: 0, y: 0 },
    data: structuredClone(template),
  } as FlowNode;
}

describe("node editor root compatibility", () => {
  test("accepts direct root templates", () => {
    const root = nodeTemplate("Root");
    const other = nodeTemplate("Other");
    const context = workspaceContext({
      rootTemplateOrVariantId: "Root",
      templates: [root, other],
    });

    expect(isTemplateCompatibleWithWorkspaceRoot(root, context)).toBe(true);
    expect(isTemplateCompatibleWithWorkspaceRoot(other, context)).toBe(false);
  });

  test("accepts variant roots including the default template", () => {
    const standard = nodeTemplate("StandardRoot");
    const random = nodeTemplate("RandomRoot");
    const other = nodeTemplate("Other");
    const context = workspaceContext({
      rootTemplateOrVariantId: "RootVariants",
      templates: [standard, random, other],
      variantKindsById: {
        RootVariants: {
          VariantFieldName: "Type",
          DefaultTemplateId: "StandardRoot",
          Variants: {
            Random: "RandomRoot",
          },
        },
      },
    });

    expect(
      getValidTemplatesForTemplateOrVariantId(context, "RootVariants").map(
        template => template.templateId,
      ),
    ).toEqual(["StandardRoot", "RandomRoot"]);
    expect(isTemplateCompatibleWithWorkspaceRoot(standard, context)).toBe(true);
    expect(isTemplateCompatibleWithWorkspaceRoot(random, context)).toBe(true);
    expect(isTemplateCompatibleWithWorkspaceRoot(other, context)).toBe(false);
  });

  test("accepts compatible normal-slot component reference templates", () => {
    const root = nodeTemplate("Instruction", {
      inputPins: [inputPin("input", "single", { connectionType: "Instruction" })],
    });
    const reference = nodeTemplate("InstructionReference", {
      isComponentReference: true,
      inputPins: [inputPin("input", "single", { connectionType: "Instruction" })],
    });
    const wholeSlotReference = nodeTemplate("InstructionWholeSlotReference", {
      isComponentReference: true,
      slotOccupancy: "whole-slot",
      inputPins: [inputPin("input", "single", { connectionType: "Instruction" })],
    });
    const incompatibleReference = nodeTemplate("ActionReference", {
      isComponentReference: true,
      inputPins: [inputPin("input", "single", { connectionType: "Action" })],
    });
    const context = workspaceContext({
      rootTemplateOrVariantId: "Instruction",
      templates: [root, reference, wholeSlotReference, incompatibleReference],
    });

    expect(isTemplateCompatibleWithWorkspaceRoot(reference, context)).toBe(true);
    expect(isTemplateCompatibleWithWorkspaceRoot(wholeSlotReference, context)).toBe(false);
    expect(isTemplateCompatibleWithWorkspaceRoot(incompatibleReference, context)).toBe(false);
  });

  test("accepts component references compatible through the root output pin", () => {
    const root = nodeTemplate("Sensor", {
      outputPins: [outputPin("output", "single", { connectionType: "Sensor", localId: "Output" })],
    });
    const reference = nodeTemplate("SensorReference", {
      isComponentReference: true,
      outputPins: [outputPin("output", "single", { connectionType: "Sensor", localId: "Output" })],
    });
    const context = workspaceContext({
      rootTemplateOrVariantId: "Sensor",
      templates: [root, reference],
    });

    expect(isTemplateCompatibleWithWorkspaceRoot(reference, context)).toBe(true);
  });

  test("does not expose current root or non-data nodes as set-root targets", () => {
    const root = nodeTemplate("Root");
    const context = workspaceContext({
      rootTemplateOrVariantId: "Root",
      templates: [root],
    });

    expect(
      canNodeBeSetAsWorkspaceRoot({
        nodeId: "root",
        currentRootNodeId: "root",
        nodeType: "datanode",
        template: root,
        workspaceContext: context,
      }),
    ).toBe(false);
    for (const nodeType of ["groupnode", "comment", "link", "rawjson"]) {
      expect(
        canNodeBeSetAsWorkspaceRoot({
          nodeId: nodeType,
          currentRootNodeId: "root",
          nodeType,
          template: root,
          workspaceContext: context,
        }),
      ).toBe(false);
    }
  });

  test("setRootNode emits a root-only element-list edit", () => {
    const root = nodeTemplate("Root");
    const context = workspaceContext({
      rootTemplateOrVariantId: "Root",
      templates: [root],
    });
    const rootA = dataNode("root-a", root);
    const rootB = dataNode("root-b", root);
    const postedMessages: WebviewToExtensionMessage[] = [];
    const session = createNodeEditorSession();
    session.context = context;
    session.nodes = [rootA, rootB];
    session.edges = [];
    session.rootNodeId = rootA.id;
    session.sourceVersion = 4;
    session.committedGraphDocument = {
      workspaceId: context.rootMenuName,
      rootNodeId: rootA.id,
      nodes: [rootA, rootB],
      edges: [],
    } as NodeEditorGraphDocument;
    session.hostBridge = {
      postMessage(message) {
        postedMessages.push(message);
      },
    };

    expect(session.setRootNode(rootB.id)).toBe(true);

    expect(session.rootNodeId).toBe(rootB.id);
    expect(postedMessages).toHaveLength(1);
    expect(postedMessages[0]).toMatchObject({
      type: "edit",
      kind: "element-list-changed",
      addedNodes: [],
      removedNodes: [],
      addedEdges: [],
      removedEdges: [],
      beforeRootNodeId: rootA.id,
      afterRootNodeId: rootB.id,
      sourceVersion: 4,
    });
  });

  test("setRootNode rejects incompatible nodes without posting edits", () => {
    const root = nodeTemplate("Root");
    const other = nodeTemplate("Other");
    const context = workspaceContext({
      rootTemplateOrVariantId: "Root",
      templates: [root, other],
    });
    const otherNode = dataNode("other", other);
    const postedMessages: WebviewToExtensionMessage[] = [];
    const session = createNodeEditorSession();
    session.context = context;
    session.nodes = [otherNode];
    session.edges = [];
    session.committedGraphDocument = {
      workspaceId: context.rootMenuName,
      nodes: [otherNode],
      edges: [],
    } as NodeEditorGraphDocument;
    session.hostBridge = {
      postMessage(message) {
        postedMessages.push(message);
      },
    };

    expect(session.setRootNode(otherNode.id)).toBe(false);

    expect(session.rootNodeId).toBeUndefined();
    expect(postedMessages).toHaveLength(0);
  });
});
