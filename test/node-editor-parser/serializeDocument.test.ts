import { describe, expect, test } from "vitest";

import {
  areSemanticallyEquivalentValues,
  expectCanonicalizedNodeId,
  findNodeByBaseId,
  formatSemanticDiff,
  inputPin,
  nodeField,
  nodeTemplate,
  normalizeRoundTripJson,
  normalizeWorkspaceStateForSemanticComparison,
  outputPin,
  parseWorkspaceDocument,
  serializeWorkspace,
  workspaceContext,
} from "./helpers";

const TEST_CONTEXT = workspaceContext({
  templates: [
    nodeTemplate("Root", {
      defaultTitle: "Root Node",
      fieldsBySchemaKey: {
        Name: nodeField("Name"),
        Preset: nodeField("Preset", "string", { value: "Default Preset" }),
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

describe("node editor serializeDocument", () => {
  test("round-trips representative workspace documents without global workspace mocks", () => {
    const document = {
      $NodeId: "Root-1",
      Name: "Biome Root",
      Type: "Root",
      Primary: {
        $NodeId: "Leaf-1",
        $Comment: "primary comment",
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
    };

    const parsed = parseWorkspaceDocument(document, TEST_CONTEXT);
    const serialized = normalizeRoundTripJson(serializeWorkspace(parsed, TEST_CONTEXT.rootMenuName));
    const reparsed = parseWorkspaceDocument(serialized as typeof document, TEST_CONTEXT);

    const rootNode = findNodeByBaseId(parsed, "Root-1");
    const primaryNode = findNodeByBaseId(parsed, "Leaf-1");
    const secondNode = findNodeByBaseId(parsed, "Leaf-2");
    const thirdNode = findNodeByBaseId(parsed, "Leaf-3");
    const floatingNode = findNodeByBaseId(parsed, "Generic-1");
    const groupNode = findNodeByBaseId(parsed, "Group-1");
    const commentNode = findNodeByBaseId(parsed, "Comment-1");

    expectCanonicalizedNodeId(rootNode.id, "Root-1");
    expectCanonicalizedNodeId(primaryNode.id, "Leaf-1");
    expectCanonicalizedNodeId(secondNode.id, "Leaf-2");
    expectCanonicalizedNodeId(thirdNode.id, "Leaf-3");
    expectCanonicalizedNodeId(floatingNode.id, "Generic-1");
    expectCanonicalizedNodeId(groupNode.id, "Group-1");
    expectCanonicalizedNodeId(commentNode.id, "Comment-1");

    const expected = normalizeWorkspaceStateForSemanticComparison(parsed);
    const actual = normalizeWorkspaceStateForSemanticComparison(reparsed);

    expect(
      areSemanticallyEquivalentValues(expected, actual),
      formatSemanticDiff(expected, actual),
    ).toBe(true);
  });

  test("orders multiple-child outputs by vertical position when serializing", () => {
    const parsed = parseWorkspaceDocument(
      {
        $NodeId: "Root-1",
        Type: "Root",
        Children: [
          {
            $NodeId: "Leaf-1",
            Value: "First Value",
          },
          {
            $NodeId: "Leaf-2",
            Value: "Second Value",
          },
        ],
        $NodeEditorMetadata: {
          $WorkspaceID: TEST_CONTEXT.rootMenuName,
          $Nodes: {
            "Root-1": {
              $Position: { $x: 10, $y: 20 },
              $Title: undefined,
            },
            "Leaf-1": {
              $Position: { $x: 120, $y: 120 },
              $Title: "First Child",
            },
            "Leaf-2": {
              $Position: { $x: 120, $y: 240 },
              $Title: "Second Child",
            },
          },
        },
      },
      TEST_CONTEXT,
    );

    findNodeByBaseId(parsed, "Leaf-1").position.y = 420;
    findNodeByBaseId(parsed, "Leaf-2").position.y = 80;

    const serialized = serializeWorkspace(parsed, TEST_CONTEXT.rootMenuName);
    const serializedChildren = serialized.Children as Array<{ Value?: string }>;

    expect(serializedChildren.map(child => child.Value)).toEqual(["Second Value", "First Value"]);
  });

  test("omits implicit empty string fields but preserves non-empty defaults", () => {
    const parsed = parseWorkspaceDocument(
      {
        $NodeId: "Root-1",
        Type: "Root",
      },
      TEST_CONTEXT,
    );

    const serialized = serializeWorkspace(parsed, TEST_CONTEXT.rootMenuName);

    expect(serialized).not.toHaveProperty("Name");
    expect(serialized.Preset).toBe("Default Preset");
  });

  test("preserves explicit empty string fields", () => {
    const parsed = parseWorkspaceDocument(
      {
        $NodeId: "Root-1",
        Type: "Root",
        Name: "",
      },
      TEST_CONTEXT,
    );

    const serialized = serializeWorkspace(parsed, TEST_CONTEXT.rootMenuName);

    expect(serialized.Name).toBe("");
  });

  test("saves cleared implicit text fields as explicit empty strings after edits", () => {
    const parsed = parseWorkspaceDocument(
      {
        $NodeId: "Root-1",
        Type: "Root",
      },
      TEST_CONTEXT,
    );

    const rootNode = findNodeByBaseId(parsed, "Root-1");
    rootNode.data.fieldsBySchemaKey.Name = {
      ...rootNode.data.fieldsBySchemaKey.Name,
      value: "",
      isImplicit: false,
    };

    const serialized = serializeWorkspace(parsed, TEST_CONTEXT.rootMenuName);

    expect(serialized.Name).toBe("");
  });

  test("serializes shared node subtrees under each parent branch using the same node ids", () => {
    const parsed = parseWorkspaceDocument(
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

    const serialized = serializeWorkspace(parsed, SHARED_SUBTREE_CONTEXT.rootMenuName);
    const left = serialized.Left as { $NodeId: string; Child?: { $NodeId: string } };
    const right = serialized.Right as { $NodeId: string; Child?: { $NodeId: string } };

    expect(left.$NodeId).toBe("SharedLeaf-22222222-2222-4222-8222-222222222222");
    expect(right.$NodeId).toBe("SharedLeaf-22222222-2222-4222-8222-222222222222");
    expect(left.Child?.$NodeId).toBe("Grandchild-33333333-3333-4333-8333-333333333333");
    expect(right.Child?.$NodeId).toBe("Grandchild-33333333-3333-4333-8333-333333333333");
  });
});
