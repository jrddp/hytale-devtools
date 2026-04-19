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
  import { sortVariantsToBottom } from "@node-editor/node-editor/utils/fieldUtils";
  import { createNodeEditorSession } from "@node-editor/workspace.svelte";
  import type { ComputeAutocompleteOption } from "@webview-shared/components/computeAutocomplete";
  import type { VSCodeApi } from "../common";
  import {
    applyNpcGraphUpdateToSession,
    hydrateNpcGraphSessionNodes,
    syncNpcGraphSessionFromDocument,
  } from "../npcGraphHost";
  import type { NpcPropertyField } from "../propertyModel";
  import { workspace } from "../workspace.svelte";
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
      const didFullSync = applyNpcGraphUpdateToSession({
        session,
        workspaceContext,
        graphUpdate,
        getFallbackGraphDocument: () => resolveGraphDocumentFromText(graphUpdate.text),
        shouldQueueInitialFitView: !initialViewport && lastAutoFitFieldPath !== field.fieldPath,
      });
      if (didFullSync && !initialViewport && lastAutoFitFieldPath !== field.fieldPath) {
        lastAutoFitFieldPath = field.fieldPath;
      }
      hydrateNpcGraphSessionNodes({
        session,
        descriptors: $state.snapshot(workspace.descriptors),
        discoveredStateInfo: $state.snapshot(workspace.discoveredStateInfo),
        roleType: workspace.roleType,
      });
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

    if (
      lastSyncedDocumentVersion === documentVersion &&
      lastSyncedGraphFieldPath === field.fieldPath
    ) {
      return;
    }

    try {
      const shouldQueueInitialFitView =
        !initialViewport && lastAutoFitFieldPath !== field.fieldPath;

      const didFullSync = syncNpcGraphSessionFromDocument({
        session,
        workspaceContext,
        fieldPath: field.fieldPath,
        documentText,
        documentVersion,
        lastSyncedGraphFieldPath,
        getFallbackGraphDocument: resolveGraphDocumentFromText,
        shouldQueueInitialFitView,
      });
      if (!didFullSync) {
        graphError = "";
        lastSyncedDocumentVersion = documentVersion;
        lastSyncedGraphFieldPath = field.fieldPath;
        hydrateNpcGraphSessionNodes({
          session,
          descriptors: $state.snapshot(workspace.descriptors),
          discoveredStateInfo: $state.snapshot(workspace.discoveredStateInfo),
          roleType: workspace.roleType,
        });
        return;
      }

      if (shouldQueueInitialFitView) {
        lastAutoFitFieldPath = field.fieldPath;
      }
      graphError = "";
      lastSyncedDocumentVersion = documentVersion;
      lastSyncedGraphFieldPath = field.fieldPath;
      hydrateNpcGraphSessionNodes({
        session,
        descriptors: $state.snapshot(workspace.descriptors),
        discoveredStateInfo: $state.snapshot(workspace.discoveredStateInfo),
        roleType: workspace.roleType,
      });
    } catch (error) {
      session.isInitialized = false;
      graphError = error instanceof Error ? error.message : String(error);
    }
  });

  $effect(() => {
    if (!workspaceContext || !session.isInitialized) {
      return;
    }

    void session.sourceVersion;
    void workspace.componentReferenceTargetVersion;
    void workspace.descriptors;
    void workspace.discoveredStateInfo;
    void workspace.roleType;
    hydrateNpcGraphSessionNodes({
      session,
      descriptors: $state.snapshot(workspace.descriptors),
      discoveredStateInfo: $state.snapshot(workspace.discoveredStateInfo),
      roleType: workspace.roleType,
    });
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
