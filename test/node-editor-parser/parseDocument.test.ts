import { describe, expect, test } from "vitest";

import {
  expectCanonicalizedNodeId,
  findEdge,
  findNode,
  findNodeByBaseId,
  inputPin,
  nodeField,
  nodeTemplate,
  outputPin,
  parseWorkspaceDocument,
  workspaceContext,
} from "./helpers";

const TEST_CONTEXT = workspaceContext({
  templates: [
    nodeTemplate("Root", {
      defaultTitle: "Root Node",
      fieldsBySchemaKey: {
        Name: nodeField("Name"),
        Enabled: nodeField("Enabled", "checkbox"),
      },
      outputPins: [outputPin("Primary"), outputPin("Children", "multiple")],
      childTypes: {
        Primary: "Leaf",
        Children: "Leaf",
      },
      schemaConstants: {
        Type: "Root",
      },
    }),
    nodeTemplate("Leaf", {
      defaultTitle: "Leaf Node",
      fieldsBySchemaKey: {
        Value: nodeField("Value"),
      },
    }),
  ],
});

const MULTI_INPUT_CONTEXT = workspaceContext({
  rootTemplateOrVariantId: "Root",
  rootMenuName: "Multi Input Test Workspace",
  templates: [
    nodeTemplate("Root", {
      outputPins: [outputPin("Primary", "single", { connectionType: "Alpha" })],
      childTypes: {
        Primary: "Leaf",
      },
      schemaConstants: {
        Type: "Root",
      },
    }),
    nodeTemplate("Leaf", {
      inputPins: [
        inputPin("input", "single", { connectionType: "Generic", localId: "Input" }),
        inputPin("input1", "single", {
          connectionType: "Alpha",
          localId: "Restricted.Input",
        }),
      ],
      fieldsBySchemaKey: {
        Value: nodeField("Value"),
      },
    }),
  ],
});

const SHARED_SUBTREE_CONTEXT = workspaceContext({
  rootTemplateOrVariantId: "Root",
  rootMenuName: "Shared Subtree Test Workspace",
  templates: [
    nodeTemplate("Root", {
      outputPins: [
        outputPin("Left", "single", { connectionType: "Alpha" }),
        outputPin("Right", "single", { connectionType: "Beta" }),
      ],
      childTypes: {
        Left: "SharedLeaf",
        Right: "SharedLeaf",
      },
      schemaConstants: {
        Type: "Root",
      },
    }),
    nodeTemplate("SharedLeaf", {
      inputPins: [
        inputPin("input", "single", { connectionType: "Alpha", localId: "Input.Alpha" }),
        inputPin("input1", "single", { connectionType: "Beta", localId: "Input.Beta" }),
      ],
      outputPins: [outputPin("Child", "single", { connectionType: "Gamma" })],
      childTypes: {
        Child: "Grandchild",
      },
      fieldsBySchemaKey: {
        Value: nodeField("Value"),
      },
    }),
    nodeTemplate("Grandchild", {
      inputPins: [inputPin("input", "single", { connectionType: "Gamma", localId: "Input" })],
      fieldsBySchemaKey: {
        Name: nodeField("Name"),
      },
    }),
  ],
});

describe("node editor parseDocument", () => {
  test("parses graph nodes, metadata nodes, comments, and groups into workspace state", () => {
    const state = parseWorkspaceDocument(
      {
        $NodeId: "Root-1",
        Name: "Biome Root",
        Enabled: true,
        Primary: {
          $NodeId: "Leaf-1",
          Value: "Primary Value",
        },
        Children: [
          {
            $NodeId: "Leaf-2",
            Value: "Second Value",
          },
          {
            $NodeId: "Leaf-3",
            Value: "Third Value",
          },
        ],
        $NodeEditorMetadata: {
          $WorkspaceID: TEST_CONTEXT.rootMenuName,
          $Nodes: {
            "Root-1": {
              $Position: { $x: 10, $y: 20 },
              $Title: "Custom Root",
            },
            "Leaf-1": {
              $Position: { $x: 120, $y: 80 },
              $Title: "Primary Title",
            },
            "Leaf-2": {
              $Position: { $x: 180, $y: 180 },
              $Title: undefined,
            },
            "Leaf-3": {
              $Position: { $x: 180, $y: 260 },
              $Title: undefined,
            },
            "Generic-1": {
              $Position: { $x: 520, $y: 160 },
              $Title: "Loose Raw",
            },
          },
          $FloatingNodes: [
            {
              $NodeId: "Generic-1",
              extra: "value",
            },
          ],
          $Groups: [
            {
              $NodeId: "Group-1",
              $Position: { $x: 32, $y: 48 },
              $width: 400,
              $height: 260,
              $name: "Primary Group",
            },
          ],
          $Comments: [
            {
              $NodeId: "Comment-1",
              $Position: { $x: 64, $y: 96 },
              $width: 280,
              $height: 140,
              $name: "Comment Title",
              $text: "Reminder",
              $fontSize: 14,
            },
          ],
        },
      },
      TEST_CONTEXT,
    );

    expect(state.nodes).toHaveLength(7);
    expect(state.edges).toHaveLength(3);

    const root = findNodeByBaseId(state, "Root-1");
    const primary = findNodeByBaseId(state, "Leaf-1");
    const second = findNodeByBaseId(state, "Leaf-2");
    const third = findNodeByBaseId(state, "Leaf-3");
    const floatingRawJson = findNodeByBaseId(state, "Generic-1");
    const group = findNodeByBaseId(state, "Group-1");
    const comment = findNodeByBaseId(state, "Comment-1");

    expect(state.rootNodeId).toBe(root.id);
    expectCanonicalizedNodeId(root.id, "Root-1");
    expectCanonicalizedNodeId(primary.id, "Leaf-1");
    expectCanonicalizedNodeId(second.id, "Leaf-2");
    expectCanonicalizedNodeId(third.id, "Leaf-3");
    expectCanonicalizedNodeId(floatingRawJson.id, "Generic-1");
    expectCanonicalizedNodeId(group.id, "Group-1");
    expectCanonicalizedNodeId(comment.id, "Comment-1");

    expect(root.type).toBe("datanode");
    expect(root.position).toEqual({ x: 10, y: 20 });
    expect(root.data.titleOverride).toBe("Custom Root");
    expect(root.data.schemaConstants).toEqual({ Type: "Root" });
    expect(root.data.fieldsBySchemaKey.Name.value).toBe("Biome Root");
    expect(root.data.fieldsBySchemaKey.Enabled.value).toBe(true);

    expect(primary.type).toBe("datanode");
    expect(primary.position).toEqual({ x: 120, y: 80 });
    expect(primary.data.titleOverride).toBe("Primary Title");
    expect(primary.data.fieldsBySchemaKey.Value.value).toBe("Primary Value");

    expect(second.data.inputConnectionIndex).toBe(0);
    expect(third.data.inputConnectionIndex).toBe(1);

    expect(floatingRawJson.type).toBe("rawjson");
    expect(floatingRawJson.position).toEqual({ x: 520, y: 160 });
    expect(floatingRawJson.data.titleOverride).toBe("Loose Raw");
    expect(JSON.parse(floatingRawJson.data.jsonString)).toEqual({
      extra: "value",
    });

    expect(group.type).toBe("groupnode");
    expect(group.width).toBe(400);
    expect(group.height).toBe(260);
    expect(group.data.titleOverride).toBe("Primary Group");

    expect(comment.type).toBe("comment");
    expect(comment.width).toBe(280);
    expect(comment.height).toBe(140);
    expect(comment.data.comment).toBe("Reminder");
    expect(comment.data.fontSize).toBe(14);

    expect(findEdge(state, `${root.id}:Primary-${primary.id}`)).toMatchObject({
      source: root.id,
      sourceHandle: "Primary",
      target: primary.id,
    });
    expect(findEdge(state, `${root.id}:Children-${second.id}`)).toMatchObject({
      source: root.id,
      sourceHandle: "Children",
      target: second.id,
    });
    expect(findEdge(state, `${root.id}:Children-${third.id}`)).toMatchObject({
      source: root.id,
      sourceHandle: "Children",
      target: third.id,
    });
  });

  test("assigns parsed edges to the compatible input handle instead of always using the default input", () => {
    const state = parseWorkspaceDocument(
      {
        $NodeId: "Root-1",
        Type: "Root",
        Primary: {
          $NodeId: "Leaf-1",
          Value: "Primary Value",
        },
      },
      MULTI_INPUT_CONTEXT,
    );

    const root = findNodeByBaseId(state, "Root-1");
    const leaf = findNodeByBaseId(state, "Leaf-1");

    expect(findEdge(state, `${root.id}:Primary-${leaf.id}`)).toMatchObject({
      source: root.id,
      sourceHandle: "Primary",
      target: leaf.id,
      targetHandle: "input1",
    });
  });

  test("reuses repeated uuid-backed node payloads as the same parsed nodes", () => {
    const state = parseWorkspaceDocument(
      {
        $NodeId: "Root-11111111-1111-4111-8111-111111111111",
        Type: "Root",
        Left: {
          $NodeId: "SharedLeaf-22222222-2222-4222-8222-222222222222",
          Value: "Shared",
          Child: {
            $NodeId: "Grandchild-33333333-3333-4333-8333-333333333333",
            Name: "Grandchild",
          },
        },
        Right: {
          $NodeId: "SharedLeaf-22222222-2222-4222-8222-222222222222",
          Value: "Shared",
          Child: {
            $NodeId: "Grandchild-33333333-3333-4333-8333-333333333333",
            Name: "Grandchild",
          },
        },
      },
      SHARED_SUBTREE_CONTEXT,
    );

    expect(state.nodes).toHaveLength(3);
    expect(state.edges).toHaveLength(3);

    const root = findNode(state, "Root-11111111-1111-4111-8111-111111111111");
    const sharedLeaf = findNode(state, "SharedLeaf-22222222-2222-4222-8222-222222222222");
    const grandchild = findNode(state, "Grandchild-33333333-3333-4333-8333-333333333333");

    expect(findEdge(state, `${root.id}:Left-${sharedLeaf.id}`)).toMatchObject({
      source: root.id,
      sourceHandle: "Left",
      target: sharedLeaf.id,
      targetHandle: "input",
    });
    expect(findEdge(state, `${root.id}:Right-${sharedLeaf.id}`)).toMatchObject({
      source: root.id,
      sourceHandle: "Right",
      target: sharedLeaf.id,
      targetHandle: "input1",
    });
    expect(findEdge(state, `${sharedLeaf.id}:Child-${grandchild.id}`)).toMatchObject({
      source: sharedLeaf.id,
      sourceHandle: "Child",
      target: grandchild.id,
      targetHandle: "input",
    });
  });

  test("throws when the same reused node id is serialized with conflicting payloads", () => {
    expect(() =>
      parseWorkspaceDocument(
        {
          $NodeId: "Root-11111111-1111-4111-8111-111111111111",
          Type: "Root",
          Left: {
            $NodeId: "SharedLeaf-22222222-2222-4222-8222-222222222222",
            Value: "First",
          },
          Right: {
            $NodeId: "SharedLeaf-22222222-2222-4222-8222-222222222222",
            Value: "Second",
          },
        },
        SHARED_SUBTREE_CONTEXT,
      ),
    ).toThrow(/Conflicting serialized payloads/);
  });
});
