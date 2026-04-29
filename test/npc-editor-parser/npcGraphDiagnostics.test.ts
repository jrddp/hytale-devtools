import { describe, expect, test } from "vitest";

import { buildNpcGraphDiagnostics } from "../../webview/hytale-npc-role-editor/src/npcGraphDiagnostics";
import type { NodeEditorSession } from "../../webview/hytale-node-editor/src/workspace.svelte";

describe("NPC graph diagnostics", () => {
  test("reports required fields, required pins, enum membership, and duplicate unique list items", () => {
    const session = createMockSession({
      nodes: [
        {
          id: "node-a",
          type: "datanode",
          data: {
            fieldsBySchemaKey: {
              Name: {
                schemaKey: "Name",
                localId: "Name",
                type: "string",
                value: "",
                isSet: true,
                required: true,
                disallowEmpty: true,
              },
              Flags: {
                schemaKey: "Flags",
                localId: "Flags",
                type: "list",
                value: ["A", "A", "Z"],
                isSet: true,
                uniqueItems: true,
                overrideAutocompleteValues: ["A", "B"],
              },
            },
            inputPins: [],
            outputPins: [
              {
                schemaKey: "Child",
                localId: "Child",
                connectionType: "Child",
                multiplicity: "single",
                required: true,
              },
            ],
          },
        },
      ],
      edges: [],
    });

    const diagnostics = buildNpcGraphDiagnostics({
      session,
      graphFieldPath: "Instructions",
      availableParameters: new Set(),
      getIndexValues: () => undefined,
      requestIndexValues: () => undefined,
      getComponentReferenceTarget: () => undefined,
      requestComponentReferenceTarget: () => undefined,
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "required-field-missing",
          target: { type: "field", nodeId: "node-a", schemaKey: "Name" },
        }),
        expect.objectContaining({
          code: "empty-string",
          target: { type: "field", nodeId: "node-a", schemaKey: "Name" },
        }),
        expect.objectContaining({
          code: "duplicate-list-item",
          target: { type: "listItem", nodeId: "node-a", schemaKey: "Flags", itemIndex: 1 },
        }),
        expect.objectContaining({
          code: "invalid-list-item",
          target: { type: "listItem", nodeId: "node-a", schemaKey: "Flags", itemIndex: 2 },
        }),
        expect.objectContaining({
          code: "required-child-missing",
          target: { type: "pin", nodeId: "node-a", pinId: "Child", direction: "output" },
        }),
      ]),
    );
  });

  test("reuses compute validation for node fields and parameter maps", () => {
    const session = createMockSession({
      nodes: [
        {
          id: "node-a",
          type: "datanode",
          data: {
            fieldsBySchemaKey: {
              Range: {
                schemaKey: "Range",
                localId: "Range",
                type: "float",
                value: { Compute: "UnknownValue" },
                isSet: true,
                computable: true,
              },
              Parameters: {
                schemaKey: "Parameters",
                localId: "Parameters",
                type: "parameterMap",
                value: {
                  Speed: { Compute: "KnownValue" },
                  Missing: { Compute: "MissingValue" },
                },
                isSet: true,
              },
            },
            inputPins: [],
            outputPins: [],
          },
        },
      ],
      edges: [],
    });

    const diagnostics = buildNpcGraphDiagnostics({
      session,
      graphFieldPath: "Instructions",
      availableParameters: new Set(["KnownValue"]),
      getIndexValues: () => undefined,
      requestIndexValues: () => undefined,
      getComponentReferenceTarget: () => undefined,
      requestComponentReferenceTarget: () => undefined,
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "compute-unresolved-variable",
          target: { type: "field", nodeId: "node-a", schemaKey: "Range" },
        }),
        expect.objectContaining({
          code: "compute-unresolved-variable",
          target: { type: "mapEntry", nodeId: "node-a", schemaKey: "Parameters", key: "Missing" },
        }),
      ]),
    );
    expect(
      diagnostics.some(
        diagnostic =>
          diagnostic.target.type === "mapEntry" &&
          diagnostic.target.schemaKey === "Parameters" &&
          diagnostic.target.key === "Speed",
      ),
    ).toBe(false);
  });

  test("requests symbol values before reporting missing asset references", () => {
    const requestedLookups: string[] = [];
    const session = createMockSession({
      nodes: [
        {
          id: "node-a",
          type: "datanode",
          data: {
            fieldsBySchemaKey: {
              Item: {
                schemaKey: "Item",
                localId: "Item",
                type: "string",
                value: "MissingItem",
                isSet: true,
                symbolLookup: {
                  indexKind: "registeredAssets",
                  key: "Item",
                },
              },
            },
            inputPins: [],
            outputPins: [],
          },
        },
      ],
      edges: [],
    });

    const pendingDiagnostics = buildNpcGraphDiagnostics({
      session,
      graphFieldPath: "Instructions",
      availableParameters: new Set(),
      getIndexValues: () => undefined,
      requestIndexValues: requestId => requestedLookups.push(requestId),
      getComponentReferenceTarget: () => undefined,
      requestComponentReferenceTarget: () => undefined,
    });

    expect(pendingDiagnostics).toEqual([]);
    expect(requestedLookups).toHaveLength(1);

    const resolvedDiagnostics = buildNpcGraphDiagnostics({
      session,
      graphFieldPath: "Instructions",
      availableParameters: new Set(),
      getIndexValues: () => ["KnownItem"],
      requestIndexValues: () => undefined,
      getComponentReferenceTarget: () => undefined,
      requestComponentReferenceTarget: () => undefined,
    });

    expect(resolvedDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid-value",
          target: { type: "field", nodeId: "node-a", schemaKey: "Item" },
        }),
      ]),
    );
  });
});

function createMockSession({
  nodes,
  edges,
}: {
  nodes: Array<{
    id: string;
    type: "datanode";
    data: {
      fieldsBySchemaKey: Record<string, unknown>;
      inputPins: unknown[];
      outputPins: unknown[];
      componentReferenceClass?: string;
    };
  }>;
  edges: Array<{
    id: string;
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
  }>;
}): NodeEditorSession {
  return {
    nodes,
    edges,
    getIncomingConnectionsForHandle(nodeId: string, handleId: string) {
      return edges.filter(edge => edge.target === nodeId && edge.targetHandle === handleId);
    },
    getOutgoingConnectionsForHandle(nodeId: string, handleId: string) {
      return edges.filter(edge => edge.source === nodeId && edge.sourceHandle === handleId);
    },
  } as unknown as NodeEditorSession;
}
