<script lang="ts">
  import {
    type ExtensionToWebviewMessage,
    type NodeEditorDocumentUpdateMessage,
    type WebviewToExtensionMessage,
  } from "@shared/node-editor/messageTypes";
  import { type NodeEditorGraphEdit } from "@shared/node-editor/graphTypes";
  import { type Viewport } from "@xyflow/svelte";
  import { type VSCodeApi } from "src/common";
  import {
    applyGraphEditToWorkspaceState,
    graphDocumentToWorkspaceState,
    graphEditRequiresDocumentRefresh,
  } from "src/node-editor/utils/graphDocument";
  import { sortVariantsToBottom } from "src/node-editor/utils/fieldUtils";
  import {
    EDITABLE_SELECTOR,
    selectAllActiveEditableText,
  } from "src/node-editor/utils/flowKeyboard";
  import NodeEditorHost from "src/NodeEditorHost.svelte";
  import { createNodeEditorSession, setActiveNodeEditorSession } from "src/workspace.svelte";
  import { onMount } from "svelte";

  const { vscode } = $props<{ vscode: VSCodeApi }>();
  type NodeEditorWebviewState = {
    viewport?: Viewport;
  };

  const session = createNodeEditorSession();
  setActiveNodeEditorSession(session);

  $effect(() => {
    session.hostBridge = {
      postMessage(message) {
        return vscode.postMessage(message);
      },
    };
  });

  let localWebviewState = $state<NodeEditorWebviewState>({});
  let extensionError = $state("");

  function persistWebviewState(nextState: NodeEditorWebviewState) {
    localWebviewState = nextState;
    vscode.setState?.(nextState);
  }

  function handleMessage(event: MessageEvent<ExtensionToWebviewMessage>) {
    const message = event.data;

    switch (message.type) {
      // should be called before initial update
      case "bootstrap":
        session.context = message.workspaceContext;
        session.controlScheme = message.controlScheme;
        session.platform = message.platform;
        session.copiedSelection = message.clipboard;
        session.isDevelopment = message.isDevelopment;
        if (!localWebviewState.viewport) {
          session.actionRequests.push({
            type: "fit-view",
            duration: 0,
            maxDistanceToRoot: 10_000,
          });
        }
        return;
      case "update":
        if (handleDocumentUpdateMessage(message)) {
          session.actionRequests.push({ type: "document-refresh" });
        }
        return;
      case "autocompletionValues":
        session.autocompleteField = message.fieldId;
        // * values sorted at bottom
        session.autocompleteValues = sortVariantsToBottom(message.values);
        return;
      case "clipboard":
        session.copiedSelection = message.clipboard;
        return;
      case "error":
        extensionError =
          typeof message.message === "string" ? message.message : "unknown editor error.";
        return;
      case "action": {
        if (message.allowEditableTarget || !document.activeElement?.matches(EDITABLE_SELECTOR)) {
          session.actionRequests.push(message.request);
        } else if (message.request.type === "select-all") {
          selectAllActiveEditableText();
        }
        return;
      }
      default:
        return;
    }
  }

  function handleDocumentUpdateMessage(message: NodeEditorDocumentUpdateMessage): boolean {
    if (
      typeof message.acknowledgedClientEditId === "number" &&
      message.acknowledgedClientEditId === session.pendingLocalEditId
    ) {
      session.sourceVersion = message.version;
      session.committedGraphDocument = message.graphDocument;
      session.pendingLocalEditId = undefined;
      extensionError = "";
      return false;
    }

    if (message.version === session.sourceVersion) return false;
    try {
      if (message.appliedEdit && applyIncomingGraphEdit(message.appliedEdit)) {
        session.sourceVersion = message.version;
        session.committedGraphDocument = message.graphDocument;
        session.pendingLocalEditId = undefined;
        extensionError = "";
        return false;
      }

      const { nodes, edges, rootNodeId } = graphDocumentToWorkspaceState(message.graphDocument);
      session.nodes = nodes;
      session.edges = edges;
      session.rootNodeId = rootNodeId;
      session.resetMeasurementTracking(nodes, true);
      session.sourceVersion = message.version;
      session.committedGraphDocument = message.graphDocument;
      session.pendingLocalEditId = undefined;
      session.isInitialized = true;

      // all nodes at 0,0 -> positions were not set in asset and we should do autolayout
      if (nodes.every(node => node.position.x === 0 && node.position.y === 0)) {
        session.actionRequests.push({ type: "auto-position-nodes" });
      }
      extensionError = "";
      return true;
    } catch (error) {
      console.error(error);
      if (!extensionError) {
        extensionError = error instanceof Error ? error.message : "could not parse flow json.";
      }
      return false;
    }
  }

  function applyIncomingGraphEdit(edit: NodeEditorGraphEdit): boolean {
    const nextState = applyGraphEditToWorkspaceState(
      {
        nodes: session.nodes,
        edges: session.edges,
        rootNodeId: session.rootNodeId,
      },
      edit,
    );

    session.nodes = nextState.nodes;
    session.edges = nextState.edges;
    session.rootNodeId = nextState.rootNodeId;
    if (edit.kind === "element-list-changed") {
      session.resetMeasurementTracking(nextState.nodes);
    }
    if (graphEditRequiresDocumentRefresh(edit)) {
      session.actionRequests.push({ type: "document-refresh" });
    }
    return true;
  }

  onMount(() => {
    if (typeof vscode.getState === "function") {
      localWebviewState = vscode.getState() ?? {};
    }

    window.addEventListener("message", handleMessage);

    const readyPayload: Extract<WebviewToExtensionMessage, { type: "ready" }> = {
      type: "ready",
    };
    vscode.postMessage(readyPayload);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  });
</script>

<main class="flex h-full min-h-0 flex-col">
  {#if extensionError}
    <div class="mx-3 mt-3 text-sm text-vsc-error">{extensionError}</div>
  {:else if session.isInitialized}
    <NodeEditorHost
      {session}
      initialViewport={localWebviewState.viewport}
      onviewportchange={viewport => persistWebviewState({ ...localWebviewState, viewport })}
    />
  {/if}
</main>
