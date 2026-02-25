<script lang="ts">
  import {
    type ExtensionToWebviewMessage,
    type NodeEditorBootstrapPayload,
    type NodeEditorDocumentUpdateMessage,
    type NodeEditorRevealSelectionMessage,
    type WebviewToExtensionMessage,
  } from "@shared/node-editor/messageTypes";
  import { SvelteFlowProvider } from "@xyflow/svelte";
  import { workspace } from "./workspaceState.svelte";
  import { onMount } from "svelte";
  import Flow from "./Flow.svelte";
  import {
    getNodeEditorQuickActionByCommandId,
    getNodeEditorQuickActionById,
  } from "./node-editor/ui/nodeEditorQuickActions";
  import { type FlowEdge, type FlowNode } from "src/node-editor/graph/graphTypes";
  import { parseDocumentText } from "src/node-editor/parsing/parse/parseDocument.svelte";
  import { serializeDocument } from "src/node-editor/parsing/serialize/serializeDocument";

  type VscodeApi = {
    postMessage: (message: WebviewToExtensionMessage) => void;
    getState?: () => Record<string, unknown> | undefined;
    setState?: (state: Record<string, unknown>) => unknown;
  };

  const { vscode } = $props<{ vscode: VscodeApi }>();

  let documentPath = "";
  let nodes: FlowNode[] = $derived(workspace.state ? workspace.state.nodes : []);
  let edges: FlowEdge[] = $derived(workspace.state ? workspace.state.edges : []);
  // last text pushed to VS Code; used to skip no-op apply messages.
  let syncedText = "";
  let sourceVersion = -1;
  // bumped for each parsed document update so Flow can run one-time load hooks.
  let graphLoadVersion = 0;
  let extensionError = "";
  let quickActionRequest:
    | {
        token: number;
        actionId: string;
        commandId: string;
      }
    | undefined = undefined;
  let quickActionRequestToken = 0;
  let revealNodeId: string | undefined = undefined;
  let revealNodeRequestVersion = 0;
  let localWebviewState: Record<string, unknown> = {};
  let isWebviewVisible =
    typeof document !== "undefined" ? document.visibilityState !== "hidden" : true;

  function handleMessage(event: MessageEvent<ExtensionToWebviewMessage>) {
    const message = event.data;
    if (!message) {
      return;
    }

    switch (message.type) {
      case "bootstrap":
        handleBootstrapMessage(message);
        return;
      case "revealSelection":
        handleRevealSelectionMessage(message);
        return;
      case "update":
        handleDocumentUpdateMessage(message);
        return;
      case "error":
        extensionError =
          typeof message.message === "string" ? message.message : "unknown editor error.";
        return;
      case "triggerQuickAction": {
        const actionFromId = getNodeEditorQuickActionById(message?.actionId);
        const actionFromCommand = getNodeEditorQuickActionByCommandId(message?.commandId);
        const quickAction = actionFromId ?? actionFromCommand;
        if (!quickAction) {
          return;
        }

        quickActionRequestToken += 1;
        quickActionRequest = {
          token: quickActionRequestToken,
          actionId: quickAction.id,
          commandId: quickAction.commandId,
        };
        return;
      }
      default:
        return;
    }
  }

  function handleBootstrapMessage(message: NodeEditorBootstrapPayload) {
    workspace.context = message.workspaceContext;
  }

  function handleRevealSelectionMessage(message: NodeEditorRevealSelectionMessage) {
    // TODO implement
  }

  function handleDocumentUpdateMessage(message: NodeEditorDocumentUpdateMessage) {
    sourceVersion = typeof message.version === "number" ? message.version : sourceVersion;
    documentPath = typeof message.documentPath === "string" ? message.documentPath : documentPath;

    try {
      const parsedState = parseDocumentText(message.text);
      console.log(parsedState);
      workspace.state = parsedState;

      graphLoadVersion += 1;
      extensionError = "";
    } catch (error) {
      extensionError = error instanceof Error ? error.message : "could not parse flow json.";
    }
  }

  function handleFlowChange(event: string, nodes: FlowNode[], edges: FlowEdge[]) {
    applyFlowState(nodes, edges);
  }

  function handleViewRawJsonRequest() {
    const payload: Extract<WebviewToExtensionMessage, { type: "openRawJson" }> = {
      type: "openRawJson",
    };
    vscode.postMessage(payload);
  }

  function handleCustomizeKeybindsRequest() {
    const payload: Extract<WebviewToExtensionMessage, { type: "openKeybindings" }> = {
      type: "openKeybindings",
      query: "Hytale Node Editor",
    };
    vscode.postMessage(payload);
  }

  function applyFlowState(nextNodes: FlowNode[], nextEdges: FlowEdge[]) {
    const serialized = serializeDocument(workspace.state.rootNodeId, nextNodes, nextEdges);

    const payload: Extract<WebviewToExtensionMessage, { type: "apply" }> = {
      type: "apply",
      text: JSON.stringify(serialized.state),
      sourceVersion,
    };

    vscode.postMessage(payload);
  }

  onMount(() => {
    if (typeof vscode.getState === "function") {
      localWebviewState = vscode.getState();
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

<main class="flex flex-col h-screen min-h-0">
  {#if extensionError}
    <div class="mx-3 mt-3 text-sm text-vsc-error">{extensionError}</div>
  {:else if workspace.state}
    <SvelteFlowProvider>
      <Flow
        bind:nodes
        bind:edges
        loadVersion={graphLoadVersion}
        {quickActionRequest}
        {revealNodeId}
        {revealNodeRequestVersion}
        onflowchange={handleFlowChange}
        onviewrawjson={handleViewRawJsonRequest}
        oncustomizekeybinds={handleCustomizeKeybindsRequest}
      />
    </SvelteFlowProvider>
  {/if}
</main>
