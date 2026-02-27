<script lang="ts">
  import {
    type ExtensionToWebviewMessage,
    type NodeEditorDocumentUpdateMessage,
    type WebviewToExtensionMessage,
  } from "@shared/node-editor/messageTypes";
  import { SvelteFlowProvider } from "@xyflow/svelte";
  import { type VSCodeApi } from "src/common";
  import { parseDocumentText } from "src/node-editor/parsing/parse/parseDocument.svelte";
  import { workspace } from "src/workspace.svelte";
  import { onMount, tick } from "svelte";
  import Flow from "./Flow.svelte";
  import {
    type NodeEditorQuickActionId,
    getNodeEditorQuickActionByCommandId,
    getNodeEditorQuickActionById,
  } from "./node-editor/ui/nodeEditorQuickActions";

  const { vscode } = $props<{ vscode: VSCodeApi }>();

  $effect(() => {
    workspace.vscode = vscode;
  });

  // bumped for each parsed document update so Flow can run one-time load hooks.
  let graphLoadVersion = $state(0);
  let extensionError = $state("");
  let quickActionRequest:
    | {
        token: number;
        actionId: NodeEditorQuickActionId;
        commandId: string;
      }
    | undefined = $state();
  let quickActionRequestToken = 0;
  let revealNodeId: string | undefined = undefined;
  let revealNodeRequestVersion = 0;
  let localWebviewState: Record<string, unknown> = {};
  let isWebviewVisible =
    typeof document !== "undefined" ? document.visibilityState !== "hidden" : true;

  function handleMessage(event: MessageEvent<ExtensionToWebviewMessage>) {
    const message = event.data;

    switch (message.type) {
      // should be called before initial update
      case "bootstrap":
        workspace.context = message.workspaceContext;
        workspace.controlScheme = message.controlScheme;
        workspace.platform = message.platform;
        return;
      case "update":
        handleDocumentUpdateMessage(message);
        return;
      case "revealSelection":
        // TODO implement
        return;
      case "error":
        extensionError =
          typeof message.message === "string" ? message.message : "unknown editor error.";
        return;
      case "triggerQuickAction": {
        const actionFromId = getNodeEditorQuickActionById(
          message?.actionId as NodeEditorQuickActionId | undefined,
        );
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

  function handleDocumentUpdateMessage(message: NodeEditorDocumentUpdateMessage) {
    if (message.version === workspace.sourceVersion) return;
    try {
      const { nodes, edges, rootNodeId } = parseDocumentText(message.text);
      workspace.nodes = nodes;
      workspace.edges = edges;
      workspace.rootNodeId = rootNodeId;
      workspace.sourceVersion = message.version;
      workspace.isInitialized = true;

      graphLoadVersion += 1;
      extensionError = "";
    } catch (error) {
      console.error(error);
      extensionError = error instanceof Error ? error.message : "could not parse flow json.";
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
      <Flow
        bind:nodes={workspace.nodes}
        bind:edges={workspace.edges}
        loadVersion={graphLoadVersion}
        {quickActionRequest}
        {revealNodeId}
        {revealNodeRequestVersion}
        onviewrawjson={handleViewRawJsonRequest}
        oncustomizekeybinds={handleCustomizeKeybindsRequest}
      />
    </SvelteFlowProvider>
  {/if}
</main>
