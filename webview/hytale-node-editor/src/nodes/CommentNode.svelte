<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { tick } from "svelte";
  import ZoomCompensatedNodeResizer from "../components/ZoomCompensatedNodeResizer.svelte";
  import { COMMENT_MUTATION_EVENT, type CommentNodeType } from "../common";
  import { applyDocumentState } from "src/workspace.svelte";

  let { id, data, selected = false, dragging = false }: CommentNodeType = $props();

  const { updateNodeData, updateNode, getNodes, getEdges, updateEdge } = useSvelteFlow();

  $effect(() => {
    if (!isEditingTitle) {
      titleDraft = data.name;
    }
  });

  $effect(() => {
    if (!isEditingText) {
      textDraft = data.name;
    }
  });

  $effect(() => {
    if (!isEditingFontSize) {
      fontSizeDraft = data.fontSize;
    }
  });

  const MIN_FONT_SIZE = 8;
  const MAX_FONT_SIZE = 128;

  let isEditingTitle = $state(false);
  let isEditingText = false;
  let isEditingFontSize = false;
  let titleDraft = $state("");
  let textDraft = $state("");
  let fontSizeDraft = $derived(data.fontSize);
  let titleInputElement = $state<HTMLInputElement | undefined>();

  async function beginTitleEditing() {
    isEditingTitle = true;
    titleDraft = data.name;
    await tick();
    titleInputElement?.focus();
    titleInputElement?.select();
  }

  function commitTitleEditing() {
    if (!isEditingTitle) {
      return;
    }

    const nextTitle = titleDraft;
    const didChange = nextTitle !== data.name;
    if (didChange) {
      applyCommentPatch({
        name: nextTitle,
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
    const didChange = nextText !== data.text;
    if (didChange) {
      applyCommentPatch({
        text: nextText,
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
    textDraft = data.text;
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

    const nextFontSize = fontSizeDraft;
    const didChange = nextFontSize !== data.fontSize;
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
    fontSizeDraft = data.fontSize;
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
    titleDraft = data.name;
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

  function handleResizeEnd() {
    applyDocumentState("comment-resized");
  }

  function applyCommentPatch(patch: { name?: string; text?: string; fontSize?: number }) {
    updateNodeData(id, {
      name: data.name,
      text: data.text,
      fontSize: data.fontSize,
      ...patch,
    });
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
    onpointerup={selectNodeFromTitleBar}
  >
    {#if isEditingTitle}
      <input
        bind:this={titleInputElement}
        class="nodrag min-w-0 flex-1 appearance-none rounded border border-vsc-input-border bg-vsc-input-bg px-1 py-0.5 font-semibold text-vsc-input-fg outline-none focus:border-vsc-focus"
        style:font-size={`${data.fontSize}px`}
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
        style:font-size={`${data.fontSize}px`}
        type="button"
        ondblclick={beginTitleEditing}
        onkeydown={handleTitleDisplayKeydown}
        aria-label={`Comment title: ${data.name}. Double click to rename`}
      >
        {data.name}
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
    style:font-size={`${data.fontSize}px`}
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
