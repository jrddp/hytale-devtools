import { describe, expect, test } from "vitest";

import {
  areSemanticallyEquivalentValues,
  expectCanonicalizedNodeId,
  findNodeByBaseId,
  formatSemanticDiff,
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
});
