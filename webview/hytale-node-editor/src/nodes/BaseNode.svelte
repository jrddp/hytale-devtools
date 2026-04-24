<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { MessageCircleMore } from "lucide-svelte";
  import type { FlowNode } from "@node-editor/common";
  import { asCssColor } from "@node-editor/node-editor/utils/colors";
  import { noMousePropogation } from "@node-editor/node-editor/utils/fieldUtils";
  import { createNodePropertiesUpdatedEdit } from "@node-editor/node-editor/utils/graphDocument";
  import { shouldShowRootTitlePrefix } from "@node-editor/node-editor/utils/rootTitle";
  import { shouldShowInputPinLabels } from "@shared/node-editor/pinUtils";
  import { useNodeEditorSession } from "@node-editor/workspace.svelte";
  import type { Snippet } from "svelte";
  import HoverTooltip from "@node-editor/components/HoverTooltip.svelte";
  import NodePinHandle from "./NodePinHandle.svelte";

  const { updateNodeData } = useSvelteFlow();
  const { id, data, children, selected, dragging, ...props }: FlowNode & { children?: Snippet } =
    $props();
  const workspace = useNodeEditorSession();

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

  const cssColor = $derived(asCssColor(nodeColor));
  const showInputPinLabels = $derived(shouldShowInputPinLabels(inputPins));

  // # Title State
  let lastComittedTitle = $derived(titleOverride);
  let effectiveTitle = $derived(titleOverride ?? defaultTitle);
  const isRootNode = $derived(workspace.rootNodeId === id);
  const showRootTitlePrefix = $derived(shouldShowRootTitlePrefix(effectiveTitle, isRootNode));
  let titleInputElement = $state<HTMLInputElement>();
  let titleSizerWidth = $state(0);
  let isEditingTitle = $state(false);
  const commitTitle = () => {
    effectiveTitle = effectiveTitle.trim();
    effectiveTitle = effectiveTitle.length > 0 ? effectiveTitle : defaultTitle;
    if (effectiveTitle !== lastComittedTitle) {
      updateNodeData(id, { titleOverride: effectiveTitle });
      lastComittedTitle = effectiveTitle;
      workspace.applyDocumentState("node-renamed");
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
      const beforeComment = lastComittedComment;
      updateNodeData(id, { comment: currentComment });
      lastComittedComment = currentComment;
      const edit = createNodePropertiesUpdatedEdit([
        {
          type: "comment",
          nodeId: id,
          beforeComment,
          afterComment: currentComment,
        },
      ]);
      if (edit) {
        workspace.applyGraphEdit(edit);
      }
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
            titleSizerWidth = el.scrollWidth;
          }}
        >
          {effectiveTitle}
        </div>
      {:else}
        <div
          class="inline-flex items-center gap-1 font-bold text-vsc-input-fg select-none"
          role="presentation"
          ondblclick={() => (isEditingTitle = true)}
        >
          {#if isRootNode}
            {#if showRootTitlePrefix}
              <span class="font-black tracking-wide">[ROOT]</span>
            {/if}
          {/if}
          <span>{effectiveTitle}</span>
        </div>
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
      {#each inputPins as pin (pin.localId)}
        <HoverTooltip text={pin.description} placement="right" wrapperClass={showInputPinLabels ? "w-full" : ""}>
          {#if showInputPinLabels}
            <div class="flex items-center gap-2">
              <NodePinHandle nodeId={id} {pin} type="target" />
              <div class="text-xs text-vsc-muted whitespace-nowrap">
                {pin.label}
              </div>
            </div>
          {:else}
            <NodePinHandle nodeId={id} {pin} type="target" />
          {/if}
        </HoverTooltip>
      {/each}
    </div>

    <!-- Content (Fields) -->
    {#if children}
      <div class="min-w-0">
        {@render children()}
      </div>
    {/if}

    <!-- Output Pins -->
    <div class="flex flex-col items-end flex-1 gap-2">
      {#each outputPins as pin (pin.localId)}
        <HoverTooltip text={pin.description} placement="left" wrapperClass="w-full">
          <div class="flex items-center justify-end gap-2">
            <div class="text-xs text-vsc-muted whitespace-nowrap">
              {pin.label}
            </div>
            <NodePinHandle nodeId={id} {pin} type="source" />
          </div>
        </HoverTooltip>
      {/each}
    </div>
  </div>
</div>
