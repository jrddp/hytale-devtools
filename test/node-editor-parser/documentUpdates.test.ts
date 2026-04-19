import { describe, expect, test, vi } from "vitest";

import type { NodeEditorGraphDocument } from "../../src/shared/node-editor/graphTypes";
import { reconcileSessionWithGraphUpdate } from "../../webview/hytale-node-editor/src/node-editor/utils/documentUpdates";
import { createNodeEditorSession } from "../../webview/hytale-node-editor/src/workspace.svelte";
import { nodeTemplate, workspaceContext } from "./helpers";

function createGraphDocument(name: string): NodeEditorGraphDocument {
  return {
    workspaceId: "Test Workspace",
    rootNodeId: "root",
    nodes: [
      {
        id: "root",
        type: "datanode",
        position: { x: 10, y: 10 },
        data: {
          ...nodeTemplate("Root"),
          titleOverride: name,
        },
      },
    ],
    edges: [],
  };
}

describe("node editor document update reconciliation", () => {
  test("does not request fallback graph parsing for acknowledged local edits", () => {
    const session = createNodeEditorSession();
    const context = workspaceContext({
      templates: [nodeTemplate("Root")],
    });
    session.context = context;
    session.sourceVersion = 1;
    session.pendingLocalEditId = 7;
    session.committedGraphDocument = createGraphDocument("Committed");

    const getFallbackGraphDocument = vi.fn(() => createGraphDocument("Fallback"));

    const didFullSync = reconcileSessionWithGraphUpdate({
      session,
      workspaceContext: context,
      getFallbackGraphDocument,
      version: 2,
      acknowledgedClientEditId: 7,
    });

    expect(didFullSync).toBe(false);
    expect(getFallbackGraphDocument).not.toHaveBeenCalled();
    expect(session.sourceVersion).toBe(2);
  });

  test("does not request fallback graph parsing for incremental remote edits when a committed document exists", () => {
    const session = createNodeEditorSession();
    const context = workspaceContext({
      templates: [nodeTemplate("Root")],
    });
    session.context = context;
    session.sourceVersion = 1;
    session.committedGraphDocument = createGraphDocument("Before");
    session.nodes = structuredClone(session.committedGraphDocument.nodes);
    session.edges = [];
    session.rootNodeId = "root";

    const getFallbackGraphDocument = vi.fn(() => createGraphDocument("Fallback"));

    const didFullSync = reconcileSessionWithGraphUpdate({
      session,
      workspaceContext: context,
      getFallbackGraphDocument,
      version: 2,
      appliedEdit: {
        kind: "node-renamed",
        changes: [
          {
            nodeId: "root",
            beforeTitleOverride: "Before",
            afterTitleOverride: "After",
          },
        ],
      },
    });

    expect(didFullSync).toBe(false);
    expect(getFallbackGraphDocument).not.toHaveBeenCalled();
    expect(session.sourceVersion).toBe(2);
    expect(session.committedGraphDocument?.nodes[0]?.data.titleOverride).toBe("After");
  });

  test("queues a document refresh for incremental element-list-changed edits", () => {
    const session = createNodeEditorSession();
    const context = workspaceContext({
      templates: [nodeTemplate("Root"), nodeTemplate("Child")],
    });
    session.context = context;
    session.sourceVersion = 1;
    session.committedGraphDocument = createGraphDocument("Before");
    session.nodes = structuredClone(session.committedGraphDocument.nodes);
    session.edges = [];
    session.rootNodeId = "root";

    const getFallbackGraphDocument = vi.fn(() => createGraphDocument("Fallback"));

    const didFullSync = reconcileSessionWithGraphUpdate({
      session,
      workspaceContext: context,
      getFallbackGraphDocument,
      version: 2,
      appliedEdit: {
        kind: "element-list-changed",
        addedNodes: [
          {
            id: "child",
            type: "datanode",
            position: { x: 20, y: 20 },
            data: nodeTemplate("Child"),
          },
        ],
        removedNodes: [],
        addedEdges: [],
        removedEdges: [],
        beforeRootNodeId: "root",
        afterRootNodeId: "root",
      },
    });

    expect(didFullSync).toBe(false);
    expect(getFallbackGraphDocument).not.toHaveBeenCalled();
    expect(session.sourceVersion).toBe(2);
    expect(session.actionRequests).toEqual([{ type: "document-refresh" }]);
    expect(session.committedGraphDocument?.nodes).toHaveLength(2);
  });

  test("falls back to full sync when no incremental edit is available for a newer version", () => {
    const session = createNodeEditorSession();
    const context = workspaceContext({
      templates: [nodeTemplate("Root")],
    });
    session.context = context;
    session.sourceVersion = 1;
    session.committedGraphDocument = createGraphDocument("Before");

    const getFallbackGraphDocument = vi.fn(() => createGraphDocument("Fallback"));

    const didFullSync = reconcileSessionWithGraphUpdate({
      session,
      workspaceContext: context,
      getFallbackGraphDocument,
      version: 2,
    });

    expect(didFullSync).toBe(true);
    expect(getFallbackGraphDocument).toHaveBeenCalledTimes(1);
    expect(session.sourceVersion).toBe(2);
    expect(session.committedGraphDocument?.nodes[0]?.data.titleOverride).toBe("Fallback");
  });
});
