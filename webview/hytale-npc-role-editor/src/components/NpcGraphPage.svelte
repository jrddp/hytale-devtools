<script lang="ts">
  import type {
    NodeEditorControlScheme,
    NodeEditorPlatform,
  } from "@shared/node-editor/messageTypes";
  import type { NodeEditorClipboardSelection } from "@shared/node-editor/clipboardTypes";
  import type { NodeEditorWorkspaceContext } from "@shared/node-editor/workspaceTypes";
  import { isObject } from "@shared/typeUtils";
  import type { AssetDocumentShape } from "@shared/node-editor/assetTypes";
  import {
    graphDocumentToWorkspaceState,
    workspaceStateNeedsAutoLayout,
  } from "@node-editor/node-editor/utils/graphDocument";
  import { sortVariantsToBottom } from "@node-editor/node-editor/utils/fieldUtils";
  import NodeEditorHost from "@node-editor/NodeEditorHost.svelte";
  import { createNodeEditorSession } from "@node-editor/workspace.svelte";
  import {
    parseAssetDocumentToGraphDocument,
    serializeGraphDocument,
  } from "@shared/node-editor/graphDocument";
  import { untrack } from "svelte";
  import type { NpcPropertyField } from "../propertyModel";
  import { workspace } from "../workspace.svelte";
  import type { VSCodeApi } from "../common";

  const {
    field,
    workspaceContext,
    controlScheme,
    platform,
    clipboard,
    autocompleteField,
    autocompleteValues,
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
    documentVersion: number;
    vscode: VSCodeApi;
  } = $props();

  const session = createNodeEditorSession();
  let graphError = $state("");
  let lastSyncedDocumentVersion = $state<number | null>(null);
  let lastSyncedGraphFieldPath = $state<string | null>(null);
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
    session.allowOpenRawJson = false;
    session.hostBridge = {
      postMessage(message) {
        switch (message.type) {
          case "edit": {
            if (!session.committedGraphDocument || isApplyingDocumentUpdate) {
              return;
            }

            const serializedRoot = extractFieldValueFromSerializedGraph(
              field,
              serializeGraphDocument(session.committedGraphDocument),
            );
            if (
              JSON.stringify(serializedRoot.value) === JSON.stringify(getGraphDocumentRoot(field)) &&
              JSON.stringify(serializedRoot.preservedData ?? {}) ===
                JSON.stringify(field.preservedData ?? {})
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
      const documentRoot = getGraphDocumentRoot(field);
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
      const { nodes, edges, rootNodeId } = graphDocumentToWorkspaceState(graphDocument);

      session.context = workspaceContext;
      session.nodes = nodes;
      session.edges = edges;
      session.rootNodeId = rootNodeId;
      session.resetMeasurementTracking(nodes, true);
      session.sourceVersion = documentVersion;
      session.committedGraphDocument = graphDocument;
      session.pendingLocalEditId = undefined;
      session.isInitialized = true;
      if (workspaceStateNeedsAutoLayout(nodes)) {
        session.actionRequests.push({ type: "auto-position-nodes" });
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

  function getGraphDocumentRoot(field: NpcPropertyField): AssetDocumentShape {
    const literalValue =
      field.isSet !== false && field.value.kind === "literal"
        ? $state.snapshot(field.value.value)
        : undefined;

    switch (field.rootType) {
      case "Instructions":
        return {
          Instructions: Array.isArray(literalValue) ? literalValue : [],
          ...(field.preservedData ? $state.snapshot(field.preservedData) : {}),
        } as AssetDocumentShape;
      default:
        if (!isObject(literalValue)) {
          return {};
        }

        return literalValue as AssetDocumentShape;
    }
  }

  function extractFieldValueFromSerializedGraph(
    field: NpcPropertyField,
    serializedRoot: AssetDocumentShape,
  ): { value: unknown; preservedData?: Record<string, unknown> } {
    switch (field.rootType) {
      case "Instructions": {
        const preservedData: Record<string, unknown> = {};
        for (const key of ["$NodeId", "$Comment", "$NodeEditorMetadata"] as const) {
          if (key in serializedRoot) {
            preservedData[key] = $state.snapshot(serializedRoot[key]);
          }
        }
        return {
          value: Array.isArray(serializedRoot.Instructions) ? serializedRoot.Instructions : [],
          preservedData: Object.keys(preservedData).length > 0 ? preservedData : undefined,
        };
      }
      default:
        return { value: serializedRoot };
    }
  }
</script>

<div class="flex h-full min-h-0 flex-1 flex-col">
  {#if graphError}
    <div class="rounded-md border border-vsc-border bg-red-500/10 px-3 py-2 text-vsc-error">
      {graphError}
    </div>
  {:else if !workspaceContext}
    <div class="rounded-md border border-dashed border-vsc-border px-4 py-3 text-sm text-vsc-muted">
      Graph editing is unavailable because the NPC Behavior workspace context could not be loaded.
    </div>
  {:else if session.isInitialized}
    <div class="min-h-0 flex-1 overflow-hidden rounded-xl border border-vsc-border bg-vsc-panel">
      <NodeEditorHost {session} />
    </div>
  {/if}
</div>
