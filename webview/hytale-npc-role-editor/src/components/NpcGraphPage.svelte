<script lang="ts">
  import type {
    NodeEditorControlScheme,
    NodeEditorPlatform,
  } from "@shared/node-editor/messageTypes";
  import type { NodeEditorClipboardSelection } from "@shared/node-editor/clipboardTypes";
  import type { NodeEditorWorkspaceContext } from "@shared/node-editor/workspaceTypes";
  import type { ComputeAutocompleteOption } from "@webview-shared/components/computeAutocomplete";
  import {
    adaptGraphDocumentRootToHostValue,
    adaptGraphHostValueToDocumentRoot,
    parseAssetDocumentToGraphDocument,
    serializeGraphDocument,
  } from "@shared/node-editor/graphDocument";
  import { syncSessionFromGraphDocument } from "@node-editor/node-editor/utils/sessionSync";
  import { sortVariantsToBottom } from "@node-editor/node-editor/utils/fieldUtils";
  import NodeEditorHost from "@node-editor/NodeEditorHost.svelte";
  import { createNodeEditorSession } from "@node-editor/workspace.svelte";
  import { untrack } from "svelte";
  import type { NpcPropertyField } from "../propertyModel";
  import { workspace } from "../workspace.svelte";
  import type { VSCodeApi } from "../common";
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
    documentVersion,
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
    documentVersion: number;
    vscode: VSCodeApi;
  } = $props();

  const session = createNodeEditorSession();
  let graphError = $state("");
  let lastSyncedDocumentVersion = $state<number | null>(null);
  let lastSyncedGraphFieldPath = $state<string | null>(null);
  let lastAutoFitFieldPath = $state<string | null>(null);
  let isApplyingDocumentUpdate = $state(false);

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
          case "edit": {
            if (!session.committedGraphDocument || isApplyingDocumentUpdate) {
              return;
            }

            const serializedRoot = adaptGraphDocumentRootToHostValue(
              serializeGraphDocument(session.committedGraphDocument),
              workspaceContext,
            );
            if (
              JSON.stringify(serializedRoot.value) ===
                JSON.stringify(getFieldGraphHostValue(field)) &&
              JSON.stringify(serializedRoot.preservedData ?? {}) ===
                JSON.stringify(getFieldGraphPreservedData(field) ?? {})
            ) {
              return;
            }
            workspace.updateGraphFieldValue(
              field.fieldPath,
              serializedRoot.value,
              serializedRoot.preservedData,
            );
            return;
          }
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

    if (
      lastSyncedDocumentVersion === documentVersion &&
      lastSyncedGraphFieldPath === field.fieldPath
    ) {
      return;
    }

    try {
      isApplyingDocumentUpdate = true;
      const documentRoot = adaptGraphHostValueToDocumentRoot(
        getFieldGraphHostValue(field),
        workspaceContext,
        getFieldGraphPreservedData(field),
      );
      const currentCommittedGraphDocument = untrack(() => session.committedGraphDocument);
      const currentContext = untrack(() => session.context);
      const committedRoot =
        currentCommittedGraphDocument !== undefined
          ? serializeGraphDocument(currentCommittedGraphDocument)
          : undefined;
      if (
        committedRoot !== undefined &&
        currentContext === workspaceContext &&
        JSON.stringify(committedRoot) === JSON.stringify(documentRoot)
      ) {
        session.sourceVersion = documentVersion;
        session.pendingLocalEditId = undefined;
        session.isInitialized = true;
        graphError = "";
        lastSyncedDocumentVersion = documentVersion;
        lastSyncedGraphFieldPath = field.fieldPath;
        return;
      }

      const graphDocument = parseAssetDocumentToGraphDocument(documentRoot, workspaceContext);
      const shouldQueueInitialFitView =
        !initialViewport && lastAutoFitFieldPath !== field.fieldPath;
      syncSessionFromGraphDocument({
        session,
        workspaceContext,
        graphDocument,
        sourceVersion: documentVersion,
        shouldQueueInitialFitView,
      });
      if (shouldQueueInitialFitView) {
        lastAutoFitFieldPath = field.fieldPath;
      }
      graphError = "";
      lastSyncedDocumentVersion = documentVersion;
      lastSyncedGraphFieldPath = field.fieldPath;
    } catch (error) {
      session.isInitialized = false;
      graphError = error instanceof Error ? error.message : String(error);
    } finally {
      isApplyingDocumentUpdate = false;
    }
  });

  function getFieldGraphHostValue(field: NpcPropertyField): unknown {
    return field.isSet !== false && field.value.kind === "literal"
      ? $state.snapshot(field.value.value)
      : undefined;
  }

  function getFieldGraphPreservedData(
    field: NpcPropertyField,
  ): Record<string, unknown> | undefined {
    return field.preservedData ? $state.snapshot(field.preservedData) : undefined;
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
