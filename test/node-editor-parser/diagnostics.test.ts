import { describe, expect, test } from "vitest";

import {
  getHighestNodeEditorDiagnosticSeverity,
  getNodeEditorDiagnosticBorderSeverity,
  getNodeEditorDiagnosticTargetKey,
  nodeEditorDiagnosticTargetBelongsToNode,
  type NodeEditorDiagnostic,
} from "../../src/shared/node-editor/diagnostics";

describe("node editor diagnostics", () => {
  test("builds stable target keys", () => {
    expect(
      getNodeEditorDiagnosticTargetKey({
        type: "field",
        nodeId: "node-a",
        schemaKey: "Name",
      }),
    ).toBe("field:node-a::Name");
    expect(
      getNodeEditorDiagnosticTargetKey({
        type: "listItem",
        nodeId: "node-a",
        schemaKey: "Flags",
        itemIndex: 2,
      }),
    ).toBe("listItem:node-a::Flags:2");
  });

  test("aggregates highest severity and suppresses low-signal warning borders", () => {
    const diagnostics: NodeEditorDiagnostic[] = [
      {
        severity: "warning",
        code: "unused-parameter",
        message: "Unused.",
        source: "test",
        target: { type: "field", nodeId: "node-a", schemaKey: "Value" },
      },
    ];

    expect(getHighestNodeEditorDiagnosticSeverity(diagnostics)).toBe("warning");
    expect(getNodeEditorDiagnosticBorderSeverity(diagnostics)).toBeUndefined();

    diagnostics.push({
      severity: "error",
      code: "required-field-missing",
      message: "Missing.",
      source: "test",
      target: { type: "field", nodeId: "node-a", schemaKey: "Name" },
    });

    expect(getHighestNodeEditorDiagnosticSeverity(diagnostics)).toBe("error");
    expect(getNodeEditorDiagnosticBorderSeverity(diagnostics)).toBe("error");
  });

  test("matches diagnostics to owning nodes", () => {
    expect(
      nodeEditorDiagnosticTargetBelongsToNode(
        { type: "pin", nodeId: "node-a", pinId: "Child", direction: "output" },
        "node-a",
      ),
    ).toBe(true);
    expect(
      nodeEditorDiagnosticTargetBelongsToNode({ type: "connection", edgeId: "edge-a" }, "node-b", edgeId =>
        edgeId === "edge-a" ? { source: "node-a", target: "node-b" } : undefined,
      ),
    ).toBe(true);
  });
});
