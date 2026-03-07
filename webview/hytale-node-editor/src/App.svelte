<script lang="ts">
  import {
    type ExtensionToWebviewMessage,
    type NodeEditorDocumentUpdateMessage,
    type WebviewToExtensionMessage,
  } from "@shared/node-editor/messageTypes";
  import { SvelteFlowProvider, type Viewport } from "@xyflow/svelte";
  import { type VSCodeApi } from "src/common";
  import { parseDocumentText } from "src/node-editor/parsing/parseDocument.svelte";
  import { sortVariantsToBottom } from "src/node-editor/utils/fieldUtils";
  import { EDITABLE_SELECTOR, selectAllActiveEditableText } from "src/node-editor/utils/flowKeyboard";
  import { workspace } from "src/workspace.svelte";
  import { onMount } from "svelte";
  import Flow from "./Flow.svelte";

  const { vscode } = $props<{ vscode: VSCodeApi }>();
  type NodeEditorWebviewState = {
    viewport?: Viewport;
  };

  $effect(() => {
    workspace.vscode = vscode;
  });

  // bumped for each parsed document update so Flow can run one-time load hooks.
  let graphLoadVersion = $state(0);
  let localWebviewState = $state<NodeEditorWebviewState>({});
  let extensionError = $state("");
  let isWebviewVisible =
    typeof document !== "undefined" ? document.visibilityState !== "hidden" : true;

  function persistWebviewState(nextState: NodeEditorWebviewState) {
    localWebviewState = nextState;
    vscode.setState?.(nextState);
  }

  function handleMessage(event: MessageEvent<ExtensionToWebviewMessage>) {
    const message = event.data;

    console.log("message received", message);
    switch (message.type) {
      // should be called before initial update
      case "bootstrap":
        workspace.context = message.workspaceContext;
        workspace.controlScheme = message.controlScheme;
        workspace.platform = message.platform;
        workspace.copiedSelection = message.clipboard;
        if (!localWebviewState.viewport) {
          workspace.actionRequests.push({
            type: "fit-view",
            duration: 0,
            maxDistanceToRoot: 10_000,
          });
        }
        return;
      case "update":
        handleDocumentUpdateMessage(message);
        workspace.actionRequests.push({ type: "document-refresh" });
        return;
      case "autocompletionValues":
        workspace.autocompleteField = message.fieldId;
        // * values sorted at bottom
        workspace.autocompleteValues = sortVariantsToBottom(message.values);
        return;
      case "clipboard":
        workspace.copiedSelection = message.clipboard;
        return;
      case "error":
        extensionError =
          typeof message.message === "string" ? message.message : "unknown editor error.";
        return;
      case "action": {
        if (message.allowEditableTarget || !document.activeElement?.matches(EDITABLE_SELECTOR)) {
          workspace.actionRequests.push(message.request);
        } else if (message.request.type === "select-all") {
          selectAllActiveEditableText();
        }
        return;
      }
      default:
        return;
    }
  }

  function handleDocumentUpdateMessage(message: NodeEditorDocumentUpdateMessage) {
    if (message.version === workspace.sourceVersion) return;
    try {
      const { nodes, edges, rootNodeId } = parseDocumentText(message.text);
      workspace.nodes = nodes;
      workspace.edges = edges;
      workspace.rootNodeId = rootNodeId;
      workspace.sourceVersion = message.version;
      workspace.isInitialized = true;

      // all nodes at 0,0 -> positions were not set in asset and we should do autolayout
      if (nodes.every(node => node.position.x === 0 && node.position.y === 0)) {
        workspace.actionRequests.push({ type: "auto-position-nodes" });
      }

      graphLoadVersion += 1;
    } catch (error) {
      console.error(error);
      if (!extensionError) {
        extensionError = error instanceof Error ? error.message : "could not parse flow json.";
      }
    }
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

<main class="flex flex-col h-screen min-h-0">
  {#if extensionError}
    <div class="mx-3 mt-3 text-sm text-vsc-error">{extensionError}</div>
  {:else if workspace.isInitialized}
    <SvelteFlowProvider>
      <Flow
        bind:nodes={workspace.nodes}
        bind:edges={workspace.edges}
        initialViewport={localWebviewState.viewport}
        onviewportchange={viewport => persistWebviewState({ ...localWebviewState, viewport })}
      />
    </SvelteFlowProvider>
  {/if}
</main>
