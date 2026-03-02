<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { tick } from "svelte";
  import { type CommentNodeType } from "src/common";
  import { DEFAULT_COMMENT_FONT_SIZE } from "src/constants";
  import { applyDocumentState } from "src/workspace.svelte";
  import ZoomCompensatedNodeResizer from "src/components/ZoomCompensatedNodeResizer.svelte";

  const MIN_FONT_SIZE = 8;
  const MAX_FONT_SIZE = 128;

  let { id, data, selected = false, dragging = false }: CommentNodeType = $props();

  const { updateNodeData } = useSvelteFlow();

  const commentTitle = $derived(readCommentTitle(data));
  const commentText = $derived(readCommentText(data));
  const fontSizeValue = $derived(readCommentFontSize(data.fontSize));

  let isEditingTitle = $state(false);
  let isEditingText = $state(false);
  let isEditingFontSize = $state(false);
  let titleDraft = $state("");
  let textDraft = $state("");
  let fontSizeDraft = $state(DEFAULT_COMMENT_FONT_SIZE);
  let titleInputElement = $state<HTMLInputElement | undefined>();

  $effect(() => {
    if (!isEditingTitle) {
      titleDraft = commentTitle;
    }
  });

  $effect(() => {
    if (!isEditingText) {
      textDraft = commentText;
    }
  });

  $effect(() => {
    if (!isEditingFontSize) {
      fontSizeDraft = fontSizeValue;
    }
  });

  async function beginTitleEditing() {
    isEditingTitle = true;
    titleDraft = commentTitle;
    await tick();
    titleInputElement?.focus();
    titleInputElement?.select();
  }

  function commitTitleEditing() {
    if (!isEditingTitle) {
      return;
    }

    const nextTitle = titleDraft;
    const didChange = nextTitle !== commentTitle;
    if (didChange) {
      applyCommentPatch({
        titleOverride: nextTitle,
      });
      applyDocumentState("comment-renamed");
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

    const nextText = textDraft;
    const didChange = nextText !== commentText;
    if (didChange) {
      applyCommentPatch({
        comment: nextText,
      });
      applyDocumentState("comment-text-updated");
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

  function handleTextInput(event: Event) {
    isEditingText = true;
    textDraft = (event.currentTarget as HTMLTextAreaElement).value;
  }

  function handleTextKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    cancelTextEditing();
    (event.currentTarget as HTMLTextAreaElement).blur();
  }

  function beginFontSizeEditing() {
    isEditingFontSize = true;
  }

  function commitFontSizeEditing() {
    if (!isEditingFontSize) {
      return;
    }

    const nextFontSize = readCommentFontSize(fontSizeDraft);
    const didChange = nextFontSize !== fontSizeValue;
    if (didChange) {
      applyCommentPatch({
        fontSize: nextFontSize,
      });
      applyDocumentState("comment-font-size-updated");
    }

    isEditingFontSize = false;
  }

  function cancelFontSizeEditing() {
    if (!isEditingFontSize) {
      return;
    }

    isEditingFontSize = false;
    fontSizeDraft = fontSizeValue;
  }

  function handleFontSizeInput(event: Event) {
    isEditingFontSize = true;
    fontSizeDraft = readCommentFontSize((event.currentTarget as HTMLInputElement).value);
  }

  function handleFontSizeKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitFontSizeEditing();
      (event.currentTarget as HTMLInputElement).blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelFontSizeEditing();
      (event.currentTarget as HTMLInputElement).blur();
    }
  }

  function cancelTitleEditing() {
    if (!isEditingTitle) {
      return;
    }

    isEditingTitle = false;
    titleDraft = commentTitle;
  }

  function handleTitleInputKeydown(event: KeyboardEvent) {
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

  function handleTitleDisplayKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void beginTitleEditing();
    }
  }

  function handleResizeEnd() {
    applyDocumentState("comment-resized");
  }

  function applyCommentPatch(patch: {
    titleOverride?: string;
    comment?: string;
    fontSize?: number;
  }) {
    updateNodeData(id, patch);
  }

  function readCommentTitle(commentData: Record<string, unknown>) {
    if (typeof commentData?.titleOverride === "string") {
      return commentData.titleOverride;
    }
    if (typeof commentData?.name === "string") {
      return commentData.name;
    }
    return "Comment";
  }

  function readCommentText(commentData: Record<string, unknown>) {
    if (typeof commentData?.comment === "string") {
      return commentData.comment;
    }
    if (typeof commentData?.text === "string") {
      return commentData.text;
    }
    return "";
  }

  function readCommentFontSize(candidateFontSize: unknown) {
    if (candidateFontSize === undefined || candidateFontSize === null) {
      return DEFAULT_COMMENT_FONT_SIZE;
    }

    const value = Number(candidateFontSize);
    if (!Number.isFinite(value)) {
      return DEFAULT_COMMENT_FONT_SIZE;
    }

    return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(value)));
  }
</script>

<div
  class="relative h-full w-full overflow-visible rounded-lg border border-vsc-editor-widget-border bg-vsc-editor-widget-bg/90 text-vsc-editor-fg shadow-lg transition-[border-color,box-shadow]"
  style="outline: {selected && !dragging ? '2px solid var(--vscode-focusBorder)' : 'none'};"
>
  <div
    class="flex items-center gap-2 border-b border-vsc-editor-widget-border bg-vsc-input-bg/70 px-2 py-1.5 cursor-grab active:cursor-grabbing"
    role="group"
    aria-label="Comment title bar"
  >
    {#if isEditingTitle}
      <input
        bind:this={titleInputElement}
        class="nodrag min-w-0 flex-1 appearance-none rounded border border-vsc-input-border bg-vsc-input-bg px-1 py-0.5 font-semibold text-vsc-input-fg outline-none focus:border-vsc-focus"
        style:font-size={`${fontSizeValue}px`}
        type="text"
        aria-label="Comment title"
        value={titleDraft}
        oninput={event => (titleDraft = event.currentTarget.value)}
        onkeydown={handleTitleInputKeydown}
        onblur={commitTitleEditing}
      />
    {:else}
      <button
        class="flex-1 min-w-0 font-semibold text-left truncate select-none text-vsc-input-fg cursor-grab active:cursor-grabbing"
        style:font-size={`${fontSizeValue}px`}
        type="button"
        ondblclick={beginTitleEditing}
        onkeydown={handleTitleDisplayKeydown}
        aria-label={`Comment title: ${commentTitle}. Double click to rename`}
      >
        {commentTitle}
      </button>
    {/if}

    <div
      data-comment-selection-exempt="true"
      class="nodrag flex items-center gap-1 rounded border border-vsc-editor-widget-border bg-vsc-editor-widget-bg px-1 py-0.5"
    >
      <input
        class="w-10 border-0 bg-transparent p-0 text-right text-[10px] font-semibold text-vsc-muted outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        type="number"
        min={MIN_FONT_SIZE}
        max={MAX_FONT_SIZE}
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
    style:font-size={`${fontSizeValue}px`}
    aria-label="Comment text"
    placeholder="Write a note..."
    value={textDraft}
    onfocus={beginTextEditing}
    oninput={handleTextInput}
    onkeydown={handleTextKeydown}
    onblur={commitTextEditing}
  ></textarea>

  <ZoomCompensatedNodeResizer isVisible={selected && !dragging} onResizeEnd={handleResizeEnd} />
</div>
