<script>
  import { useSvelteFlow } from "@xyflow/svelte";
  import { tick } from "svelte";
  import ZoomCompensatedNodeResizer from "../components/ZoomCompensatedNodeResizer.svelte";
  import {
    COMMENT_MAX_FONT_SIZE,
    COMMENT_MIN_FONT_SIZE,
    COMMENT_MIN_HEIGHT,
    COMMENT_MIN_WIDTH,
    normalizeCommentFontSize,
    normalizeCommentName,
    normalizeCommentText,
  } from "../node-editor/commentMetadata.js";
  import { COMMENT_MUTATION_EVENT } from "../node-editor/types.js";

  export let id;
  export let data = {};
  export let selected = false;
  export let dragging = false;

  const { updateNodeData, updateNode, getNodes, getEdges, updateEdge } = useSvelteFlow();

  $: commentName = normalizeCommentName(data?.$commentName);
  $: commentText = normalizeCommentText(data?.$commentText);
  $: commentFontSizePx = normalizeCommentFontSize(data?.$fontSize);
  $: titleFontSizePx = Math.max(11, Math.round(commentFontSizePx + 1));
  $: commentLineHeightPx = Math.max(16, Math.round(commentFontSizePx * 1.35));
  $: if (!isEditingTitle) {
    titleDraft = commentName;
  }
  $: if (!isEditingText) {
    textDraft = commentText;
  }
  $: if (!isEditingFontSize) {
    fontSizeDraft = String(commentFontSizePx);
  }

  let isEditingTitle = false;
  let isEditingText = false;
  let isEditingFontSize = false;
  let titleDraft = "";
  let textDraft = "";
  let fontSizeDraft = "";
  let titleInputElement;

  async function beginTitleEditing() {
    isEditingTitle = true;
    titleDraft = commentName;
    await tick();
    titleInputElement?.focus();
    titleInputElement?.select();
  }

  function commitTitleEditing() {
    if (!isEditingTitle) {
      return;
    }

    const normalizedTitle = normalizeCommentName(titleDraft);
    const didChange = normalizedTitle !== commentName;
    if (didChange) {
      applyCommentPatch({
        $commentName: normalizedTitle,
      });
      notifyCommentMutation("comment-renamed");
    }

    isEditingTitle = false;
  }

  function beginTextEditing() {
    isEditingText = true;
  }

  function commitTextEditing() {
    if (!isEditingText) {
      return;
    }

    const normalizedText = normalizeCommentText(textDraft);
    const didChange = normalizedText !== commentText;
    if (didChange) {
      applyCommentPatch({
        $commentText: normalizedText,
      });
      notifyCommentMutation("comment-text-updated");
    }

    isEditingText = false;
  }

  function cancelTextEditing() {
    if (!isEditingText) {
      return;
    }

    isEditingText = false;
    textDraft = commentText;
  }

  function handleTextInput(event) {
    isEditingText = true;
    textDraft = event.currentTarget.value;
  }

  function handleTextKeydown(event) {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    cancelTextEditing();
    event.currentTarget.blur();
  }

  function beginFontSizeEditing() {
    isEditingFontSize = true;
  }

  function commitFontSizeEditing() {
    if (!isEditingFontSize) {
      return;
    }

    const normalizedFontSize = normalizeCommentFontSize(fontSizeDraft);
    const didChange = normalizedFontSize !== commentFontSizePx;
    if (didChange) {
      applyCommentPatch({
        $fontSize: normalizedFontSize,
      });
      notifyCommentMutation("comment-font-size-updated");
    }

    isEditingFontSize = false;
  }

  function cancelFontSizeEditing() {
    if (!isEditingFontSize) {
      return;
    }

    isEditingFontSize = false;
    fontSizeDraft = String(commentFontSizePx);
  }

  function handleFontSizeInput(event) {
    isEditingFontSize = true;
    fontSizeDraft = event.currentTarget.value;
  }

  function handleFontSizeKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitFontSizeEditing();
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelFontSizeEditing();
      event.currentTarget.blur();
    }
  }

  function cancelTitleEditing() {
    if (!isEditingTitle) {
      return;
    }

    isEditingTitle = false;
    titleDraft = commentName;
  }

  function handleTitleInputKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitTitleEditing();
      titleInputElement?.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelTitleEditing();
      titleInputElement?.blur();
    }
  }

  function handleTitleDisplayKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void beginTitleEditing();
    }
  }

  function selectNodeFromTitleBar(event) {
    if (isEditingTitle || isEditingFontSize) {
      return;
    }

    const pointerButton = Number(event?.button);
    if (Number.isFinite(pointerButton) && pointerButton !== 0) {
      return;
    }

    const pointerTarget = event?.target;
    if (
      typeof pointerTarget?.closest === "function" &&
      pointerTarget.closest("[data-comment-selection-exempt='true']")
    ) {
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

  function handleResizeEnd() {
    notifyCommentMutation("comment-resized");
  }

  function applyCommentPatch(patch) {
    updateNodeData(id, {
      $commentName: commentName,
      $commentText: commentText,
      $fontSize: commentFontSizePx,
      ...patch,
    });
  }

  function notifyCommentMutation(reason) {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(COMMENT_MUTATION_EVENT, {
        detail: {
          nodeId: id,
          reason,
        },
      })
    );
  }

</script>

<div
  class="relative h-full w-full overflow-visible rounded-lg border border-vsc-editor-widget-border bg-vsc-editor-widget-bg/90 text-vsc-editor-fg shadow-lg transition-[border-color,box-shadow]"
  class:border-vsc-focus={selected && !dragging}
>
  <div
    class="flex items-center gap-2 border-b border-vsc-editor-widget-border bg-vsc-input-bg/70 px-2 py-1.5 cursor-grab active:cursor-grabbing"
    role="group"
    aria-label="Comment title bar"
    onpointerup={selectNodeFromTitleBar}
  >
    {#if isEditingTitle}
      <input
        bind:this={titleInputElement}
        class="nodrag min-w-0 flex-1 appearance-none rounded border border-vsc-input-border bg-vsc-input-bg px-1 py-0.5 font-semibold text-vsc-input-fg outline-none focus:border-vsc-focus"
        style:font-size={`${titleFontSizePx}px`}
        type="text"
        aria-label="Comment title"
        value={titleDraft}
        oninput={event => (titleDraft = event.currentTarget.value)}
        onkeydown={handleTitleInputKeydown}
        onblur={commitTitleEditing}
      />
    {:else}
      <button
        class="min-w-0 flex-1 truncate text-left font-semibold text-vsc-input-fg cursor-grab active:cursor-grabbing select-none"
        style:font-size={`${titleFontSizePx}px`}
        type="button"
        ondblclick={beginTitleEditing}
        onkeydown={handleTitleDisplayKeydown}
        aria-label={`Comment title: ${commentName}. Double click to rename`}
      >
        {commentName}
      </button>
    {/if}

    <div
      data-comment-selection-exempt="true"
      class="nodrag flex items-center gap-1 rounded border border-vsc-editor-widget-border bg-vsc-editor-widget-bg px-1 py-0.5"
    >
      <input
        class="w-10 border-0 bg-transparent p-0 text-right text-[10px] font-semibold text-vsc-muted outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        type="number"
        min={COMMENT_MIN_FONT_SIZE}
        max={COMMENT_MAX_FONT_SIZE}
        step="1"
        aria-label="Comment font size"
        value={fontSizeDraft}
        onfocus={beginFontSizeEditing}
        oninput={handleFontSizeInput}
        onkeydown={handleFontSizeKeydown}
        onblur={commitFontSizeEditing}
      />
      <span class="text-[10px] font-semibold text-vsc-muted">px</span>
    </div>
  </div>

  <textarea
    class="nodrag h-[calc(100%-2.75rem)] w-full resize-none border-0 bg-transparent p-2 text-vsc-editor-fg outline-none placeholder:text-vsc-muted"
    style:font-size={`${commentFontSizePx}px`}
    style:line-height={`${commentLineHeightPx}px`}
    aria-label="Comment text"
    placeholder="Write a note..."
    value={textDraft}
    onfocus={beginTextEditing}
    oninput={handleTextInput}
    onkeydown={handleTextKeydown}
    onblur={commitTextEditing}
  ></textarea>

  <ZoomCompensatedNodeResizer
    isVisible={selected && !dragging}
    minWidth={COMMENT_MIN_WIDTH}
    minHeight={COMMENT_MIN_HEIGHT}
    onResizeEnd={handleResizeEnd}
  />
</div>
