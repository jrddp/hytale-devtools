<script lang="ts">
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import { useSvelteFlow } from "@xyflow/svelte";
  import { MessageCircleMore, Pencil } from "lucide-svelte";
  import { tick } from "svelte";
  import FieldEditor from "../fields/FieldEditor.svelte";
  import NodeCommentEditor from "./NodeCommentEditor.svelte";
  import NodePinHandle from "./NodePinHandle.svelte";
  import {
    focusNextEditableInNode,
    isPlainEnterNavigationEvent,
  } from "../node-editor/ui/focusNavigation";
  import { type RawJsonNodeType } from "../common";
  import { INPUT_HANDLE_ID } from "@shared/node-editor/sharedConstants";
  import { DEFAULT_RAW_JSON_TEXT, DEFAULT_RAW_JSON_LABEL } from "src/constants";
  import { applyDocumentState } from "src/workspace.svelte";
  import { getDefaultInputPin } from "src/node-editor/utils/nodeUtils.svelte";

  const RAW_JSON_FIELD: NodeField = {
    schemaKey: "Data",
    label: "Data",
    type: "text",
  };
  const NODE_MIN_WIDTH_PX = 288;
  const NODE_ACCENT_COLOR = "var(--vscode-focusBorder)";
  const PIN_TOP = "50%";

  let { id, data, selected = false, dragging = false }: RawJsonNodeType = $props();

  const { updateNodeData, updateNode, getNodes, getEdges, updateEdge } = useSvelteFlow();

  // data key constants - should be imported from a shared location
  const NODE_TITLE_OVERRIDE_DATA_KEY = "nodeTitle";
  const NODE_INPUT_INDEX_DATA_KEY = "inputIndex";

  const nodeLabel = $derived(data.titleOverride ?? DEFAULT_RAW_JSON_LABEL);
  const inputConnectionIndex = $derived(
    readInputConnectionIndex(data?.[NODE_INPUT_INDEX_DATA_KEY]),
  );
  const inputConnectionIndexPrefix = $derived(
    inputConnectionIndex !== undefined ? `[${inputConnectionIndex}]` : undefined,
  );
  const commentInputId = $derived(`comment-${id ?? "node"}`);
  const commentValue = $derived(typeof data?.comment === "string" ? data.comment : "");
  const dataFieldValue = $derived(
    typeof data?.jsonString === "string" ? data.jsonString : DEFAULT_RAW_JSON_TEXT,
  );

  const inputPin = getDefaultInputPin({ color: NODE_ACCENT_COLOR });

  $effect(() => {
    if (!isEditingTitle) {
      titleDraft = nodeLabel;
    }
  });

  let isEditingTitle = $state(false);
  let titleDraft = $state("");
  let titleInputElement = $state<HTMLInputElement | undefined>();
  let isCommentVisible = $state(false);
  let commentEditor;

  function updateLabel(nextLabel) {
    updateNodeData(id, {
      [NODE_TITLE_OVERRIDE_DATA_KEY]: nextLabel,
    });
    applyDocumentState("raw-json-label-updated");
  }

  function updateData(nextValue) {
    updateNodeData(id, {
      data: typeof nextValue === "string" ? nextValue : String(nextValue ?? DEFAULT_RAW_JSON_TEXT),
    });
    applyDocumentState("raw-json-field-updated");
  }

  function selectNodeFromTitleBar(event) {
    // let SvelteFlow handle Shift-based additive/toggle selection semantics.
    if (event?.shiftKey) {
      return;
    }

    const isMultiSelect = Boolean(event?.metaKey || event?.ctrlKey);
    const currentNodes = getNodes();

    for (const node of currentNodes) {
      const shouldSelect = node.id === id ? true : isMultiSelect ? Boolean(node.selected) : false;

      if (node.selected !== shouldSelect) {
        updateNode(node.id, { selected: shouldSelect });
      }
    }

    if (isMultiSelect) {
      return;
    }

    const currentEdges = getEdges();
    for (const edge of currentEdges) {
      if (edge.selected) {
        updateEdge(edge.id, { selected: false });
      }
    }
  }

  async function beginTitleEditing() {
    isEditingTitle = true;
    titleDraft = nodeLabel;
    await tick();
    titleInputElement?.focus();
    titleInputElement?.select();
  }

  function commitTitleEditing(moveFocus = false) {
    if (!isEditingTitle) {
      return;
    }

    updateLabel(titleDraft);
    isEditingTitle = false;

    if (moveFocus) {
      if (!focusNextEditableInNode(titleInputElement)) {
        titleInputElement?.blur();
      }
    }
  }

  function cancelTitleEditing() {
    if (!isEditingTitle) {
      return;
    }

    isEditingTitle = false;
    titleDraft = nodeLabel;
  }

  function handleTitleInputKeydown(event) {
    if (isPlainEnterNavigationEvent(event)) {
      event.preventDefault();
      commitTitleEditing(true);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelTitleEditing();
      titleInputElement?.blur();
    }
  }

  function handleTitleInputBlur() {
    commitTitleEditing(false);
  }

  function handleTitleDisplayKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void beginTitleEditing();
    }
  }

  function beginCommentEditingFromButton() {
    void commentEditor?.startEditing(false);
  }

  function handleCommentSelect(event) {
    // selectNodeFromTitleBar(event.detail?.originalEvent);
  }

  function updateComment(nextComment) {
    updateNodeData(id, {
      comment: typeof nextComment === "string" ? nextComment : String(nextComment ?? ""),
    });
    applyDocumentState("raw-json-comment-updated");
  }

  function readInputConnectionIndex(candidateIndex) {
    if (candidateIndex === undefined || candidateIndex === null) {
      return undefined;
    }
    return Number(candidateIndex);
  }
</script>

<div
  class="relative border border-vsc-editor-widget-border rounded-lg shadow-lg bg-vsc-editor-widget-bg text-vsc-editor-fg transition-[border-color,box-shadow]"
  style="min-width: {NODE_MIN_WIDTH_PX}px; outline: {selected && !dragging
    ? '2px solid var(--vscode-focusBorder)'
    : 'none'};"
  data-node-editor-root
>
  <div
    aria-hidden="true"
    class="absolute inset-x-0 top-0 z-10 h-1 rounded-t-lg pointer-events-none"
    style="background-color: {NODE_ACCENT_COLOR};"
  ></div>

  <div class="flex flex-col gap-1">
    <div class="flex items-center gap-1 rounded-t-lg bg-vsc-input-bg text-vsc-input-fg">
      {#if isEditingTitle}
        <input
          bind:this={titleInputElement}
          class="w-full p-2 font-bold border rounded-t-lg border-vsc-input-border"
          type="text"
          value={titleDraft}
          oninput={event => (titleDraft = event.currentTarget.value)}
          onkeydown={handleTitleInputKeydown}
          onblur={handleTitleInputBlur}
        />
      {:else}
        <div
          class="flex items-center flex-1 gap-1 p-2 cursor-grab active:cursor-grabbing"
          role="group"
          aria-label="Node title bar"
          onpointerdown={selectNodeFromTitleBar}
        >
          <button
            class="min-w-0 font-bold text-left border border-transparent rounded-md select-none text-vsc-input-fg cursor-grab active:cursor-grabbing"
            type="button"
            ondblclick={beginTitleEditing}
            onkeydown={handleTitleDisplayKeydown}
          >
            {#if inputConnectionIndexPrefix !== undefined}
              <span class="mr-1 text-vsc-muted">{inputConnectionIndexPrefix}</span>
            {/if}
            <span>{nodeLabel}</span>
          </button>

          <button
            class="inline-flex items-center justify-center rounded-md nodrag size-4 hover:backdrop-brightness-90"
            type="button"
            title="Edit node title"
            aria-label="Edit node title"
            onclick={beginTitleEditing}
          >
            <Pencil strokeWidth={2.5} aria-hidden="true" />
          </button>

          <button
            class="inline-flex items-center justify-center ml-auto rounded-md nodrag size-4 hover:backdrop-brightness-90"
            type="button"
            title="Edit node comment"
            aria-label="Edit node comment"
            aria-expanded={isCommentVisible}
            aria-controls={commentInputId}
            onclick={beginCommentEditingFromButton}
          >
            <MessageCircleMore strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>
      {/if}
    </div>

    <NodeCommentEditor
      bind:this={commentEditor}
      bind:isVisible={isCommentVisible}
      id={commentInputId}
      value={commentValue}
      on:change={event => updateComment(event.detail.value)}
      on:select={handleCommentSelect}
    />
  </div>

  <div class="px-4.5 py-2">
    <NodePinHandle nodeId={id} pin={inputPin} type="target" />

    <FieldEditor nodeId={id} {...RAW_JSON_FIELD} value={dataFieldValue} onvalidate={updateData} />
  </div>
</div>
