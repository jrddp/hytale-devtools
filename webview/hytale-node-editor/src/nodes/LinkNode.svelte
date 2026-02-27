<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { tick } from "svelte";
  import { LINK_MUTATION_EVENT, type LinkNodeType } from "../common";
  import {
    focusNextEditableInNode,
    isPlainEnterNavigationEvent,
  } from "../node-editor/ui/focusNavigation";
  import { applyDocumentState } from "src/workspace.svelte";

  const DEFAULT_NODE_LABEL = "Link";

  const DEFAULT_LINK_PIN_COLOR = "var(--vscode-descriptionForeground)";
  const PIN_WIDTH = 10;
  const PIN_TOP = "50%";
  const NODE_MIN_WIDTH_BASE_PX = 80;

  let { id, data, selected = false, dragging = false }: LinkNodeType = $props();

  const { updateNodeData, updateNode, getNodes, getEdges, updateEdge } =
    useSvelteFlow<LinkNodeType>();

  let nodeLabel = $derived(data.titleOverride ?? DEFAULT_NODE_LABEL);
  let commentInputId = $derived(`comment-${id ?? "node"}`);

  let isEditingTitle = false;
  let titleDraft = "";
  let titleInputElement;
  let commentEditor;
  let isCommentVisible = false;

  function updateLabel(nextLabel: string) {
    updateNodeData(id, {
      titleOverride: nextLabel,
    });
    applyDocumentState("link-label-updated");
  }

  function updateComment(nextComment) {
    const currentComment = typeof nextComment === "string" ? nextComment : "";
    updateNodeData(id, {
      comment: currentComment,
    });
    applyDocumentState("link-comment-updated");
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
    selectNodeFromTitleBar(event.detail?.originalEvent);
  }
</script>

<!-- <div
  class="relative border border-vsc-editor-widget-border rounded-lg shadow-lg bg-vsc-editor-widget-bg text-vsc-editor-fg transition-[border-color,box-shadow]"
  style="min-width: {nodeMinWidthPx}px; outline: {selected && !dragging
    ? '2px solid var(--vscode-focusBorder)'
    : 'none'};"
  data-node-editor-root
>
  <div
    aria-hidden="true"
    class="absolute inset-x-0 top-0 z-10 h-1 rounded-t-lg pointer-events-none"
    style="background-color: {DEFAULT_LINK_PIN_COLOR};"
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
            {nodeLabel}
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

  <div
    class="relative py-3"
    style="padding-left: {PIN_WIDTH + 8}px; padding-right: {outputLabelColumnWidth + 8}px;"
  >
    <NodePinHandle
      type="target"
      side="left"
      id={LINK_INPUT_HANDLE_ID}
      top={PIN_TOP}
      width={PIN_WIDTH}
      label={INPUT_LABEL}
      showTooltip={true}
      color={inputPinColor}
    />

    <NodePinHandle
      type="source"
      side="right"
      id={LINK_OUTPUT_HANDLE_ID}
      top={PIN_TOP}
      width={PIN_WIDTH}
      color={outputPinColor}
      connectionMultiplicity={outputPinMultiplicity}
    />
    <div
      class="pointer-events-none absolute pr-1 -translate-y-1/2 text-right text-[11px] text-vsc-muted whitespace-nowrap"
      style="top: {PIN_TOP}; right: {PIN_WIDTH}px;"
    >
      {outputPinLabel}
    </div>
  </div>
</div> -->

<!-- TODO implement -->
<div>not implemented</div>
