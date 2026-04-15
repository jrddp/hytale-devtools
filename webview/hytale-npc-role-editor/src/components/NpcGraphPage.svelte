<script lang="ts">
  import type { NpcRoleEditorGraphUpdateMessage } from "@shared/npc-role-editor/messageTypes";
  import { resolveNpcGraphDocumentFromText } from "@shared/npc-role-editor/graphDocumentRuntime";
  import type { NodeEditorClipboardSelection } from "@shared/node-editor/clipboardTypes";
  import type {
    NodeEditorControlScheme,
    NodeEditorPlatform,
  } from "@shared/node-editor/messageTypes";
  import type { NodeEditorWorkspaceContext } from "@shared/node-editor/workspaceTypes";
  import NodeEditorHost from "@node-editor/NodeEditorHost.svelte";
  import { reconcileSessionWithGraphUpdate } from "@node-editor/node-editor/utils/documentUpdates";
  import { sortVariantsToBottom } from "@node-editor/node-editor/utils/fieldUtils";
  import { syncSessionFromGraphDocument } from "@node-editor/node-editor/utils/sessionSync";
  import { createNodeEditorSession } from "@node-editor/workspace.svelte";
  import type { ComputeAutocompleteOption } from "@webview-shared/components/computeAutocomplete";
  import type { VSCodeApi } from "../common";
  import type { NpcPropertyField } from "../propertyModel";
  import GraphFallbackField from "./fields/GraphFallbackField.svelte";

  type GraphViewport = {
    x: number;
    y: number;
    zoom: number;
  };

  const {
    field,
    workspaceContext,
    controlScheme,
    platform,
    clipboard,
    autocompleteField,
    autocompleteValues,
    computeAutocompleteOptions,
    initialViewport,
    onviewportchange,
    documentText,
    documentVersion,
    graphUpdate,
    vscode,
  }: {
    field: NpcPropertyField;
    workspaceContext?: NodeEditorWorkspaceContext;
    controlScheme: NodeEditorControlScheme;
    platform: NodeEditorPlatform;
    clipboard: NodeEditorClipboardSelection;
    autocompleteField?: string;
    autocompleteValues: string[];
    computeAutocompleteOptions: ComputeAutocompleteOption[];
    initialViewport?: GraphViewport;
    onviewportchange?: (viewport: GraphViewport) => void;
    documentText: string | null;
    documentVersion: number;
    graphUpdate?: NpcRoleEditorGraphUpdateMessage | null;
    vscode: VSCodeApi;
  } = $props();

  const session = createNodeEditorSession();
  let graphError = $state("");
  let lastSyncedDocumentVersion = $state<number | null>(null);
  let lastSyncedGraphFieldPath = $state<string | null>(null);
  let lastAutoFitFieldPath = $state<string | null>(null);

  $effect(() => {
    if (session.controlScheme !== controlScheme) {
      session.controlScheme = controlScheme;
    }
  });

  $effect(() => {
    if (session.platform !== platform) {
      session.platform = platform;
    }
  });

  $effect(() => {
    session.copiedSelection = clipboard;
  });

  $effect(() => {
    session.autocompleteField = autocompleteField;
    session.autocompleteValues = sortVariantsToBottom(autocompleteValues);
  });

  $effect(() => {
    session.computeAutocompleteOptions = computeAutocompleteOptions;
  });

  $effect(() => {
    session.allowOpenRawJson = false;
    session.hostBridge = {
      postMessage(message) {
        switch (message.type) {
          case "edit":
            if (!workspaceContext) {
              return;
            }
            vscode.postMessage({
              ...message,
              fieldPath: field.fieldPath,
            });
            return;
          case "openKeybindings":
            vscode.postMessage({
              type: "openKeybindings",
              query: message.query,
            });
            return;
          case "clipboard":
            vscode.postMessage(message);
            return;
          case "autocompleteRequest":
            vscode.postMessage(message);
            return;
          case "update-setting":
            vscode.postMessage(message);
            return;
          default:
            return;
        }
      },
    };
  });

  $effect(() => {
    if (!workspaceContext) {
      graphError = "The NPC Behavior workspace context was not available.";
      session.isInitialized = false;
      return;
    }
  });

  $effect(() => {
    if (
      !graphUpdate ||
      !workspaceContext ||
      graphUpdate.fieldPath !== field.fieldPath ||
      graphUpdate.version <= (lastSyncedDocumentVersion ?? -1)
    ) {
      return;
    }

    try {
      const didFullSync = reconcileSessionWithGraphUpdate({
        session,
        workspaceContext,
        getFallbackGraphDocument: () => resolveGraphDocumentFromText(graphUpdate.text),
        version: graphUpdate.version,
        acknowledgedClientEditId: graphUpdate.acknowledgedClientEditId,
        appliedEdit: graphUpdate.appliedEdit,
        shouldQueueInitialFitView: !initialViewport && lastAutoFitFieldPath !== field.fieldPath,
      });
      if (didFullSync && !initialViewport && lastAutoFitFieldPath !== field.fieldPath) {
        lastAutoFitFieldPath = field.fieldPath;
      }
      graphError = "";
      lastSyncedDocumentVersion = graphUpdate.version;
      lastSyncedGraphFieldPath = field.fieldPath;
    } catch (error) {
      session.isInitialized = false;
      graphError = error instanceof Error ? error.message : String(error);
    }
  });

  $effect(() => {
    if (!workspaceContext) {
      return;
    }

    const isSameGraphField = lastSyncedGraphFieldPath === field.fieldPath;
    if (lastSyncedDocumentVersion === documentVersion && isSameGraphField) {
      return;
    }

    try {
      const shouldQueueInitialFitView =
        !initialViewport && lastAutoFitFieldPath !== field.fieldPath;

      if (!isSameGraphField) {
        syncSessionFromGraphDocument({
          session,
          workspaceContext,
          graphDocument: resolveGraphDocumentFromText(documentText),
          sourceVersion: documentVersion,
          shouldQueueInitialFitView,
        });
      } else {
        const didFullSync = reconcileSessionWithGraphUpdate({
          session,
          workspaceContext,
          getFallbackGraphDocument: () => resolveGraphDocumentFromText(documentText),
          version: documentVersion,
          shouldQueueInitialFitView,
        });
        if (!didFullSync) {
          graphError = "";
          lastSyncedDocumentVersion = documentVersion;
          lastSyncedGraphFieldPath = field.fieldPath;
          return;
        }
      }

      if (shouldQueueInitialFitView) {
        lastAutoFitFieldPath = field.fieldPath;
      }
      graphError = "";
      lastSyncedDocumentVersion = documentVersion;
      lastSyncedGraphFieldPath = field.fieldPath;
    } catch (error) {
      session.isInitialized = false;
      graphError = error instanceof Error ? error.message : String(error);
    }
  });

  function resolveGraphDocumentFromText(text: string | null) {
    if (!workspaceContext) {
      throw new Error("The NPC Behavior workspace context was not available.");
    }

    return resolveNpcGraphDocumentFromText({
      text,
      fieldPath: field.fieldPath,
      workspaceContext,
    });
  }
</script>

<div class="flex h-full min-h-0 flex-1 flex-col">
  {#if graphError || !workspaceContext}
    <GraphFallbackField
      root
      {field}
      notice={graphError ||
        "Graph editing is unavailable because the NPC Behavior workspace context could not be loaded."}
    />
  {:else if session.isInitialized}
    <div class="min-h-0 flex-1 overflow-hidden rounded-xl border border-vsc-border bg-vsc-panel">
      <NodeEditorHost {session} {initialViewport} {onviewportchange} />
    </div>
  {/if}
</div>
