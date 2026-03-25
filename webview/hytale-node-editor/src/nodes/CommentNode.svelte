<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { tick } from "svelte";
  import type { CommentNodeType } from "src/common";
  import ZoomCompensatedNodeResizer from "src/components/ZoomCompensatedNodeResizer.svelte";
  import {
    DEFAULT_COMMENT_FONT_SIZE,
    DEFAULT_COMMENT_HEIGHT,
    DEFAULT_COMMENT_WIDTH,
  } from "src/constants";
  import {
    createNodePropertiesUpdatedEdit,
    createNodeResizeChange,
  } from "src/node-editor/utils/graphDocument";
  import {
    focusNextEditableInNode,
    isPlainEnterNavigationEvent,
  } from "src/node-editor/utils/focusNavigation";
  import { noMousePropogation } from "src/node-editor/utils/fieldUtils";
  import { applyDocumentState, applyGraphEdit } from "src/workspace.svelte";

  const MIN_FONT_SIZE = 8;
  const MAX_FONT_SIZE = 128;
  const MIN_CONTROL_FONT_SIZE = 10;
  const MAX_CONTROL_FONT_SIZE = 24;

  let { id, data, width, height, selected = false, dragging = false }: CommentNodeType = $props();

  const { updateNode, updateNodeData } = useSvelteFlow();

  let rootElement = $state<HTMLDivElement>();
  let titleInputElement = $state<HTMLInputElement>();
  let titleElement = $state<HTMLElement>();
  let commentInputElement = $state<HTMLTextAreaElement>();
  let isEditingTitle = $state(false);
  let isCommittingTitle = $state(false);
  let isCommittingComment = $state(false);
  let isCommittingFontSize = $state(false);
  let isPreviewingFontSize = $state(false);
  let fontSizePreviewBaseWidth = $state(DEFAULT_COMMENT_WIDTH);
  let fontSizePreviewBaseHeight = $state(DEFAULT_COMMENT_HEIGHT);
  let resizeRequestVersion = 0;

  const defaultTitle = $derived(readDefaultTitle(data));
  const sourceTitle = $derived(readCommentTitle(data));
  const sourceComment = $derived(readCommentText(data));
  const sourceFontSize = $derived(normalizeFontSize(data.fontSize));

  let lastCommittedTitle = $state("");
  let lastCommittedComment = $state("");
  let lastCommittedFontSize = $state(DEFAULT_COMMENT_FONT_SIZE);

  let title = $state("");
  let comment = $state("");
  let fontSizeInputValue = $state(String(DEFAULT_COMMENT_FONT_SIZE));
  const previewFontSize = $derived(normalizeFontSize(fontSizeInputValue));

  const controlFontSize = $derived(
    Math.max(MIN_CONTROL_FONT_SIZE, Math.min(previewFontSize, MAX_CONTROL_FONT_SIZE)),
  );

  $effect(() => {
    if (!isCommittingTitle && sourceTitle !== lastCommittedTitle) {
      title = sourceTitle;
      lastCommittedTitle = sourceTitle;
    }
  });

  $effect(() => {
    if (!isCommittingComment && sourceComment !== lastCommittedComment) {
      comment = sourceComment;
      lastCommittedComment = sourceComment;
    }
  });

  $effect(() => {
    if (!isCommittingFontSize && sourceFontSize !== lastCommittedFontSize) {
      fontSizeInputValue = String(sourceFontSize);
      lastCommittedFontSize = sourceFontSize;
    }
  });

  $effect(() => {
    if (dragging) {
      isEditingTitle = false;
    }
  });

  $effect(() => {
    if (isEditingTitle) {
      titleInputElement?.focus();
      titleInputElement?.select();
    }
  });

  $effect(() => {
    if (!isPreviewingFontSize || isCommittingFontSize) {
      return;
    }

    void previewFontSize;
    void title;
    void comment;
    void resizeNodeToFitContent(fontSizePreviewBaseWidth, fontSizePreviewBaseHeight);
  });

  function readCurrentNodeSize() {
    return {
      width: Math.ceil(rootElement?.offsetWidth ?? width ?? DEFAULT_COMMENT_WIDTH),
      height: Math.ceil(rootElement?.offsetHeight ?? height ?? DEFAULT_COMMENT_HEIGHT),
    };
  }

  function beginFontSizePreview() {
    if (isPreviewingFontSize) {
      return;
    }

    const currentSize = readCurrentNodeSize();
    fontSizePreviewBaseWidth = currentSize.width;
    fontSizePreviewBaseHeight = currentSize.height;
    isPreviewingFontSize = true;
  }

  async function resizeNodeToFitContent(minWidth: number, minHeight: number) {
    const requestVersion = ++resizeRequestVersion;
    const currentSize = readCurrentNodeSize();
    let nextWidth = minWidth;
    let nextHeight = minHeight;

    updateNode(id, { width: minWidth, height: minHeight });
    await tick();

    if (requestVersion !== resizeRequestVersion) {
      return false;
    }

    if (titleElement && titleElement.scrollWidth > titleElement.clientWidth) {
      nextWidth = Math.max(
        nextWidth,
        minWidth + titleElement.scrollWidth - titleElement.clientWidth + 8,
      );
    }

    if (commentInputElement) {
      if (commentInputElement.scrollWidth > commentInputElement.clientWidth) {
        nextWidth = Math.max(
          nextWidth,
          minWidth + commentInputElement.scrollWidth - commentInputElement.clientWidth + 8,
        );
      }

      if (commentInputElement.scrollHeight > commentInputElement.clientHeight) {
        nextHeight = Math.max(
          nextHeight,
          minHeight + commentInputElement.scrollHeight - commentInputElement.clientHeight + 8,
        );
      }
    }

    if (requestVersion !== resizeRequestVersion) {
      return false;
    }

    if (nextWidth !== minWidth || nextHeight !== minHeight) {
      updateNode(id, { width: nextWidth, height: nextHeight });
    }

    return nextWidth !== currentSize.width || nextHeight !== currentSize.height;
  }

  async function commitTitle() {
    if (isCommittingTitle) {
      return;
    }
    isCommittingTitle = true;

    const normalizedTitle = title.trim();
    const nextTitle = normalizedTitle.length > 0 ? normalizedTitle : defaultTitle;
    const nextTitleOverride = nextTitle !== defaultTitle ? nextTitle : undefined;
    title = nextTitle;
    isEditingTitle = false;

    const didChange = nextTitle !== lastCommittedTitle;
    if (didChange) {
      lastCommittedTitle = nextTitle;
      updateNodeData(id, { titleOverride: nextTitleOverride });
    }
    const currentSize = readCurrentNodeSize();
    const didResize = await resizeNodeToFitContent(currentSize.width, currentSize.height);

    if (didChange) {
      applyDocumentState("node-renamed");
    } else if (didResize) {
      applyDocumentState("node-resized");
    }

    isCommittingTitle = false;
  }

  async function commitComment() {
    if (isCommittingComment) {
      return;
    }
    isCommittingComment = true;

    const nextComment = comment;
    const previousComment = lastCommittedComment;
    const didChange = nextComment !== lastCommittedComment;
    if (didChange) {
      lastCommittedComment = nextComment;
      updateNodeData(id, { comment: nextComment });
    }
    const currentSize = readCurrentNodeSize();
    const didResize = await resizeNodeToFitContent(currentSize.width, currentSize.height);
    const nextSize = didResize ? readCurrentNodeSize() : currentSize;

    if (didChange) {
      const resizeChange = createNodeResizeChange(id, currentSize, nextSize);
      const edit = createNodePropertiesUpdatedEdit(
        [
          {
            type: "comment",
            nodeId: id,
            beforeComment: previousComment,
            afterComment: nextComment,
          },
        ],
        resizeChange ? [resizeChange] : [],
      );
      if (edit) {
        applyGraphEdit(edit);
      }
    } else if (didResize) {
      applyDocumentState("node-resized");
    }

    isCommittingComment = false;
  }

  async function commitFontSize() {
    if (isCommittingFontSize) {
      return;
    }
    isCommittingFontSize = true;

    const nextFontSize = previewFontSize;
    fontSizeInputValue = String(nextFontSize);
    const didChange = nextFontSize !== lastCommittedFontSize;
    const beforeStoredFontSize =
      lastCommittedFontSize === DEFAULT_COMMENT_FONT_SIZE ? undefined : lastCommittedFontSize;
    const afterStoredFontSize =
      nextFontSize === DEFAULT_COMMENT_FONT_SIZE ? undefined : nextFontSize;
    const beforeSize = isPreviewingFontSize
      ? {
          width: fontSizePreviewBaseWidth,
          height: fontSizePreviewBaseHeight,
        }
      : readCurrentNodeSize();
    if (didChange) {
      lastCommittedFontSize = nextFontSize;
      updateNodeData(id, {
        fontSize: afterStoredFontSize,
      });
    }
    await resizeNodeToFitContent(beforeSize.width, beforeSize.height);
    const nextSize = readCurrentNodeSize();
    isPreviewingFontSize = false;
    const resizeChange = createNodeResizeChange(id, beforeSize, nextSize);

    if (didChange) {
      const edit = createNodePropertiesUpdatedEdit(
        [
          {
            type: "font-size",
            nodeId: id,
            beforeFontSize: beforeStoredFontSize,
            afterFontSize: afterStoredFontSize,
          },
        ],
        resizeChange ? [resizeChange] : [],
      );
      if (edit) {
        applyGraphEdit(edit);
      }
    } else if (resizeChange) {
      applyDocumentState("node-resized");
    }

    isCommittingFontSize = false;
  }

  function handleTitleKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (isPlainEnterNavigationEvent(event)) {
      event.preventDefault();
      void commitTitle();
      if (!focusNextEditableInNode(event.currentTarget)) {
        event.currentTarget.blur();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      void commitTitle();
      event.currentTarget.blur();
    }
  }

  function handleCommentKeydown(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    void commitComment();
    event.currentTarget.blur();
  }

  function handleFontSizeKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (isPlainEnterNavigationEvent(event)) {
      event.preventDefault();
      void commitFontSize();
      if (!focusNextEditableInNode(event.currentTarget)) {
        event.currentTarget.blur();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      void commitFontSize();
      event.currentTarget.blur();
    }
  }

  function handleResizeEnd() {
    applyDocumentState("node-resized");
  }

  function handleFontSizeInput(event: Event & { currentTarget: HTMLInputElement }) {
    beginFontSizePreview();
    fontSizeInputValue = event.currentTarget.value;
  }

  function readDefaultTitle(commentData: Record<string, unknown>) {
    if (typeof commentData?.defaultTitle === "string") {
      return commentData.defaultTitle;
    }
    if (typeof commentData?.name === "string") {
      return commentData.name;
    }
    return "Comment";
  }

  function readCommentTitle(commentData: Record<string, unknown>) {
    if (typeof commentData?.titleOverride === "string") {
      return commentData.titleOverride;
    }
    return readDefaultTitle(commentData);
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

  function normalizeFontSize(candidate: unknown) {
    const value = Number(candidate);
    if (!Number.isFinite(value)) {
      return DEFAULT_COMMENT_FONT_SIZE;
    }

    return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(value)));
  }
</script>

<div
  data-node-editor-root
  bind:this={rootElement}
  class="relative flex h-full w-full flex-col overflow-visible rounded-lg border border-vsc-editor-widget-border bg-vsc-editor-widget-bg/90 text-vsc-editor-fg shadow-lg transition-[border-color,box-shadow]"
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
        {@attach element => (titleElement = element)}
        class="nodrag min-w-0 flex-1 appearance-none rounded border border-vsc-input-border bg-vsc-input-bg px-1 py-0.5 font-semibold text-vsc-input-fg outline-none focus:border-vsc-focus"
        style:font-size={`${previewFontSize}px`}
        type="text"
        aria-label="Comment title"
        bind:value={title}
        onkeydown={handleTitleKeydown}
        onblur={() => void commitTitle()}
        {...noMousePropogation}
      />
    {:else}
      <button
        bind:this={titleElement}
        class="min-w-0 flex-1 truncate select-none text-left font-semibold text-vsc-input-fg"
        style:font-size={`${previewFontSize}px`}
        type="button"
        ondblclick={() => (isEditingTitle = true)}
      >
        {title}
      </button>
    {/if}

    <div
      class="nodrag flex items-center gap-[0.35em] rounded border border-vsc-editor-widget-border bg-vsc-editor-widget-bg px-[0.45em] py-[0.25em]"
      style:font-size={`${controlFontSize}px`}
    >
      <input
        class="w-[3em] border-0 bg-transparent p-0 text-right font-semibold text-vsc-muted outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        type="number"
        min={MIN_FONT_SIZE}
        max={MAX_FONT_SIZE}
        step="1"
        aria-label="Comment font size"
        value={fontSizeInputValue}
        onfocus={beginFontSizePreview}
        oninput={handleFontSizeInput}
        onkeydown={handleFontSizeKeydown}
        onblur={commitFontSize}
        {...noMousePropogation}
      />
      <span class="text-[0.75em] font-semibold text-vsc-muted">px</span>
    </div>
  </div>

  <textarea
    bind:this={commentInputElement}
    class="nodrag min-h-0 flex-1 resize-none border-0 bg-transparent p-2 text-vsc-editor-fg outline-none placeholder:text-vsc-muted"
    style:font-size={`${previewFontSize}px`}
    aria-label="Comment text"
    placeholder="Write a note..."
    bind:value={comment}
    onkeydown={handleCommentKeydown}
    onblur={() => void commitComment()}
    {...noMousePropogation}
  ></textarea>

  <ZoomCompensatedNodeResizer isVisible={selected && !dragging} onResizeEnd={handleResizeEnd} />
</div>
