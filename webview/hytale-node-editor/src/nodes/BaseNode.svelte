<script lang="ts">
  import { useSvelteFlow, useViewport } from "@xyflow/svelte";
  import { MessageCircleMore } from "lucide-svelte";
  import type { FlowNode } from "src/common";
  import { readColorForCss } from "src/node-editor/utils/colors";
  import { noMousePropogation } from "src/node-editor/utils/fieldUtils";
  import { applyDocumentState } from "src/workspace.svelte";
  import type { Snippet } from "svelte";
  import NodePinHandle from "./NodePinHandle.svelte";

  const viewport = useViewport();
  const { updateNode, updateNodeData } = useSvelteFlow();
  const { id, data, children, selected, dragging, ...props }: FlowNode & { children?: Snippet } =
    $props();

  const MIN_WIDTH_PX = 80;

  const {
    nodeColor,
    inputPins,
    outputPins,
    inputConnectionIndex,
    defaultTitle,
    titleOverride,
    comment,
  } = $derived(data);

  const cssColor = $derived(readColorForCss(nodeColor));

  // # Title State
  let lastComittedTitle = $derived(titleOverride);
  let effectiveTitle = $derived(titleOverride ?? defaultTitle);
  let titleInputElement = $state<HTMLInputElement>();
  let titleSizerWidth = $state(0);
  let isEditingTitle = $state(false);
  const commitTitle = () => {
    effectiveTitle = effectiveTitle.trim();
    effectiveTitle = effectiveTitle.length > 0 ? effectiveTitle : defaultTitle;
    if (effectiveTitle !== lastComittedTitle) {
      updateNodeData(id, { titleOverride: effectiveTitle });
      lastComittedTitle = effectiveTitle;
      applyDocumentState("node-title-updated");
    }
    isEditingTitle = false;
  };
  $effect(() => {
    if (isEditingTitle) {
      titleInputElement.focus();
      titleInputElement.select();
    } else titleInputElement?.blur();
  });

  // # Comment State
  let lastComittedComment = $derived(comment);
  let currentComment = $derived(comment);
  let commentInputElement = $state<HTMLTextAreaElement>();
  let commentInputHeight = $derived.by(() => {
    void currentComment;
    return commentInputElement?.scrollHeight;
  });
  let isEditingComment = $state(false);
  const commitComment = () => {
    if (currentComment !== lastComittedComment) {
      updateNodeData(id, { currentComment });
      lastComittedComment = currentComment;
      applyDocumentState("node-comment-updated");
    }
    isEditingComment = false;
  };
  $effect(() => {
    if (isEditingComment) commentInputElement.focus();
    else commentInputElement?.blur();
  });

  $effect(() => {
    if (dragging) {
      isEditingTitle = false;
      isEditingComment = false;
    }
  });

  function handleTitleInputKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case "Enter":
      case "Escape":
        event.preventDefault();
        titleInputElement?.blur();
        commitTitle();
        break;
    }
  }

  function handleCommentInputKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case "Enter":
        if (event.shiftKey) break;
      case "Escape":
        event.preventDefault();
        commentInputElement?.blur();
        commitComment();
        break;
    }
  }
</script>

<div
  class="ring ring-vsc-editor-widget-border rounded-lg shadow-lg bg-vsc-editor-widget-bg text-vsc-editor-fg transition-[border-color,box-shadow] overflow-visible"
  style="min-width: {MIN_WIDTH_PX}px; outline: {selected
    ? '2px solid var(--vscode-focusBorder)'
    : 'none'}; {dragging && 'cursor-grabbing!'}"
>
  <!-- Node Header -->
  <div class="bg-vsc-input-bg relative overflow-clip! rounded-t-lg">
    <div
      aria-hidden="true"
      class="absolute inset-x-0 top-0 h-1 pointer-events-none"
      style="background-color: {cssColor};"
    ></div>
    <!-- Title bar -->
    <div
      class="flex items-center gap-1 p-1 rounded-t-lg text-vsc-input-fg"
      class:pb-0={isEditingComment || (currentComment && currentComment.length > 0)}
    >
      {#if inputConnectionIndex !== undefined}
        <span class="text-xs font-medium text-vsc-muted">{`[${inputConnectionIndex}]`}</span>
      {/if}

      <!-- Title -->
      {#if isEditingTitle}
        <input
          bind:this={titleInputElement}
          class="font-bold text-vsc-input-fg outline-none!"
          style="width: {titleSizerWidth}px;"
          type="text"
          bind:value={effectiveTitle}
          {...noMousePropogation}
          onfocus={() => (isEditingTitle = true)}
          onkeydown={handleTitleInputKeydown}
          onblur={commitTitle}
        />
        <!-- Hidden Sizer to update input width dynamically -->
        <div
          class="absolute invisible font-bold whitespace-pre"
          aria-hidden="true"
          {@attach el => {
            void effectiveTitle;
            titleSizerWidth = el.getBoundingClientRect().width / viewport.current.zoom;
          }}
        >
          {effectiveTitle}
        </div>
      {:else}
        <button
          class="font-bold text-vsc-input-fg cursor-text outline-none!"
          ondblclick={() => (isEditingTitle = true)}
        >
          {effectiveTitle}
        </button>
      {/if}

      <!-- Edit Comment Button -->
      <button
        class="inline-flex items-center justify-center ml-auto rounded-md size-4 hover:backdrop-brightness-90"
        type="button"
        {...noMousePropogation}
        onclickcapture={e => {
          isEditingComment = true;
        }}
      >
        <MessageCircleMore strokeWidth={2.25} aria-hidden="true" />
      </button>
    </div>

    <!-- Comment -->
    {#if isEditingComment || (currentComment && currentComment.length > 0)}
      <textarea
        class="w-full p-1 py-0.5 pl-2 m-0 text-xs font-medium resize-none bg-vsc-input-bg text-vsc-muted"
        style="height: {commentInputHeight}px"
        rows={1}
        bind:this={commentInputElement}
        bind:value={currentComment}
        {...noMousePropogation}
        onkeydown={handleCommentInputKeydown}
        onblur={commitComment}
        spellcheck="false"
      ></textarea>
    {/if}
  </div>

  <!-- Node Body -->
  <div class="flex gap-4 py-2">
    <!-- Input Pins -->
    <div class="flex flex-col gap-2">
      {#each inputPins as pin}
        <NodePinHandle nodeId={id} {pin} type="target" />
      {/each}
    </div>

    <!-- Content (Fields) -->
    <div>
      {@render children?.()}
    </div>

    <!-- Output Pins -->
    <div class="flex flex-col items-end flex-1 gap-2">
      {#each outputPins as pin, index}
        <div class="flex items-center gap-2">
          <div class="text-xs text-vsc-muted whitespace-nowrap">
            {pin.label}
          </div>
          <NodePinHandle nodeId={id} {pin} type="source" />
        </div>
      {/each}
    </div>
  </div>
</div>
