<script lang="ts">
  import {
    type ExtensionToWebviewMessage,
    type NodeEditorDocumentUpdateMessage,
    type WebviewToExtensionMessage,
  } from "@shared/node-editor/messageTypes";
  import { SvelteFlowProvider } from "@xyflow/svelte";
  import { type VSCodeApi } from "src/common";
  import { parseDocumentText } from "src/node-editor/parsing/parseDocument.svelte";
  import { workspace } from "src/workspace.svelte";
  import { onMount } from "svelte";
  import Flow from "./Flow.svelte";

  const { vscode } = $props<{ vscode: VSCodeApi }>();

  $effect(() => {
    workspace.vscode = vscode;
  });

  // bumped for each parsed document update so Flow can run one-time load hooks.
  let graphLoadVersion = $state(0);
  let localWebviewState = $state<Record<string, unknown>>({});
  let extensionError = $state("");
  let isWebviewVisible =
    typeof document !== "undefined" ? document.visibilityState !== "hidden" : true;

  function handleMessage(event: MessageEvent<ExtensionToWebviewMessage>) {
    const message = event.data;

    console.log("message received", message);
    switch (message.type) {
      // should be called before initial update
      case "bootstrap":
        workspace.context = message.workspaceContext;
        workspace.controlScheme = message.controlScheme;
        workspace.platform = message.platform;
        workspace.actionRequests.push({ type: "fit-view", duration: 0 });
        return;
      case "update":
        handleDocumentUpdateMessage(message);
        workspace.actionRequests.push({ type: "document-refresh" });
        return;
      case "error":
        extensionError =
          typeof message.message === "string" ? message.message : "unknown editor error.";
        return;
      case "action": {
        workspace.actionRequests.push(message.request);
        return;
      }
      default:
        return;
    }
  }

  function handleDocumentUpdateMessage(message: NodeEditorDocumentUpdateMessage) {
    if (message.version === workspace.sourceVersion) return;
    try {
      const { nodes, edges, rootNodeId, arePositionsSet } = parseDocumentText(message.text);
      workspace.nodes = nodes;
      workspace.edges = edges;
      workspace.rootNodeId = rootNodeId;
      workspace.sourceVersion = message.version;
      workspace.isInitialized = true;

      if (!arePositionsSet) {
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

  function handleViewRawJsonRequest() {
    const payload: Extract<WebviewToExtensionMessage, { type: "openRawJson" }> = {
      type: "openRawJson",
    };
    workspace.vscode.postMessage(payload);
  }

  function handleCustomizeKeybindsRequest() {
    const payload: Extract<WebviewToExtensionMessage, { type: "openKeybindings" }> = {
      type: "openKeybindings",
      query: "Hytale Node Editor",
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
  {:else if workspace.isInitialized}
    <SvelteFlowProvider>
      <Flow bind:nodes={workspace.nodes} bind:edges={workspace.edges} />
    </SvelteFlowProvider>
  {/if}
</main>
