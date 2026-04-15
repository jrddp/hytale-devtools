import { describe, expect, test } from "vitest";

import type { NodeEditorGraphDocument } from "../../src/shared/node-editor/graphTypes";
import { nodeTemplate, workspaceContext } from "./helpers";
import { createNodeEditorSession } from "../../webview/hytale-node-editor/src/workspace.svelte";
import { syncSessionFromGraphDocument } from "../../webview/hytale-node-editor/src/node-editor/utils/sessionSync";

describe("node editor session sync", () => {
  test("clears stale queued actions before enqueueing initial sync actions", () => {
    const session = createNodeEditorSession();
    session.actionRequests = [{ type: "document-refresh" }];

    const context = workspaceContext({
      templates: [nodeTemplate("Root")],
    });
    const graphDocument: NodeEditorGraphDocument = {
      workspaceId: "Test Workspace",
      rootNodeId: "root",
      nodes: [
        {
          id: "root",
          type: "datanode",
          position: { x: 10, y: 10 },
          data: {
            ...nodeTemplate("Root"),
          },
        },
      ],
      edges: [],
    };

    syncSessionFromGraphDocument({
      session,
      workspaceContext: context,
      graphDocument,
      sourceVersion: 3,
      shouldQueueInitialFitView: true,
    });

    expect(session.actionRequests).toEqual([
      {
        type: "fit-view",
        duration: 0,
        maxDistanceToRoot: 10_000,
      },
    ]);
  });
});
