<script lang="ts">
  import {
    type ExtensionToWebviewMessage,
    type NodeEditorDocumentUpdateMessage,
    type WebviewToExtensionMessage,
  } from "@shared/node-editor/messageTypes";
  import { type Viewport } from "@xyflow/svelte";
  import { type VSCodeApi } from "@node-editor/common";
  import { reconcileSessionWithGraphUpdate } from "@node-editor/node-editor/utils/documentUpdates";
  import { syncSessionFromGraphDocument } from "@node-editor/node-editor/utils/sessionSync";
  import { sortVariantsToBottom } from "@node-editor/node-editor/utils/fieldUtils";
  import {
    EDITABLE_SELECTOR,
    selectAllActiveEditableText,
  } from "@node-editor/node-editor/utils/flowKeyboard";
  import NodeEditorHost from "@node-editor/NodeEditorHost.svelte";
  import { createNodeEditorSession } from "@node-editor/workspace.svelte";
  import { onMount } from "svelte";

  const { vscode } = $props<{ vscode: VSCodeApi }>();
  type NodeEditorWebviewState = {
    viewport?: Viewport;
  };

  const session = createNodeEditorSession();

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
    try {
      const didFullSync = reconcileSessionWithGraphUpdate({
        session,
        workspaceContext: session.context,
        getFallbackGraphDocument: () => message.graphDocument,
        version: message.version,
        acknowledgedClientEditId: message.acknowledgedClientEditId,
        appliedEdit: message.appliedEdit,
        shouldQueueInitialFitView: !localWebviewState.viewport,
      });
      extensionError = "";
      return didFullSync;
    } catch (error) {
      console.error(error);
      if (!extensionError) {
        extensionError = error instanceof Error ? error.message : "could not parse flow json.";
      }
      return false;
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
