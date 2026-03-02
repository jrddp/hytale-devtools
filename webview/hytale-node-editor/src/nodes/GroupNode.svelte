<script lang="ts">
  import { useSvelteFlow, useViewport } from "@xyflow/svelte";
  import { type GroupNodeType } from "src/common";
  import ZoomCompensatedNodeResizer from "src/components/ZoomCompensatedNodeResizer.svelte";
  import { MIN_GROUP_HEIGHT, MIN_GROUP_WIDTH } from "src/constants";
  import { isPlainEnterNavigationEvent } from "src/node-editor/ui/focusNavigation";
  import { applyDocumentState, workspace } from "src/workspace.svelte";

  const GROUP_TITLE_BASE_SIZE_PX = 18;
  const GROUP_TITLE_MAX_COMPENSATION_SCALE = 12;

  let { id, data, selected, dragging, draggable }: GroupNodeType = $props();

  $effect(() => {
    if (workspace.controlScheme === "mouse") {
      updateNode(id, { draggable: selected || hoveringTitlebar });
    } else if (!draggable) {
      updateNode(id, { draggable: true });
    }
  });

  const viewport = useViewport();
  const { updateNodeData, updateNode } = useSvelteFlow();

  let titleInputElement = $state<HTMLInputElement | undefined>();
  let titleSizerWidth = $state(0);
  let lastComittedTitle = $derived(data.titleOverride ?? data.defaultTitle);
  let effectiveTitle = $derived(data.titleOverride ?? data.defaultTitle);
  let isEditingTitle = $state(false);
  const titleCompensationScale = $derived(
    Math.min(GROUP_TITLE_MAX_COMPENSATION_SCALE, Math.max(1, 1 / viewport.current.zoom)),
  );
  const commitTitle = () => {
    effectiveTitle = effectiveTitle.trim();
    effectiveTitle = effectiveTitle.length > 0 ? effectiveTitle : data.defaultTitle;
    if (effectiveTitle !== lastComittedTitle) {
      updateNodeData(id, { titleOverride: effectiveTitle });
      lastComittedTitle = effectiveTitle;
      applyDocumentState("group-renamed");
    }
    isEditingTitle = false;
  };

  let hoveringTitlebar = $state(false);

  function handleTitleInputKeydown(event: KeyboardEvent) {
    if (isPlainEnterNavigationEvent(event)) {
      event.preventDefault();
      commitTitle();
      titleInputElement?.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      commitTitle();
      titleInputElement?.blur();
    }
  }

  function handleResizeEnd() {
    applyDocumentState("group-resized");
  }
</script>

<div
  class="relative h-full w-full overflow-visible rounded-lg border border-dashed border-vsc-editor-widget-border bg-vsc-editor-widget-bg/40 text-vsc-editor-fg transition-[border-color,box-shadow]"
  class:cursor-grabbing={dragging}
  style="outline: {selected && !dragging ? '2px solid var(--vscode-focusBorder)' : 'none'};"
>
  <!-- Title Bar -->
  <div
    class="absolute inset-x-0 top-0 flex items-end h-8 gap-1 px-2 pb-1 overflow-visible border-b rounded-t-lg border-vsc-editor-widget-border/80 bg-vsc-input-bg/60 cursor-grab active:cursor-grabbing"
    role="group"
    aria-label="Group title bar"
    onpointerenter={() => (hoveringTitlebar = true)}
    onpointerleave={() => (hoveringTitlebar = false)}
  >
    <div class="z-10 flex items-end min-w-0 gap-1 overflow-visible">
      {#if isEditingTitle}
        <input
          bind:this={titleInputElement}
          class="inline-block px-0 py-0 font-semibold leading-none text-left transition-transform duration-100 ease-out origin-bottom-left bg-transparent border-0 rounded outline-none appearance-none w-fit nodrag whitespace-nowrap text-vsc-editor-fg ring-0 placeholder:text-vsc-muted focus:outline-none focus:ring-0"
          style:font-size={`${GROUP_TITLE_BASE_SIZE_PX}px`}
          style:transform={`scale(${titleCompensationScale})`}
          type="text"
          aria-label="Edit group title"
          bind:value={effectiveTitle}
          style="width: {titleSizerWidth}px;"
          onkeydown={handleTitleInputKeydown}
          onblur={commitTitle}
        />
        <!-- Hidden Sizer to update input width dynamically -->
        <div
          class="absolute invisible font-semibold whitespace-pre"
          aria-hidden="true"
          {@attach el => {
            void effectiveTitle;
            titleSizerWidth =
              (titleCompensationScale * el.getBoundingClientRect().width) / viewport.current.zoom;
          }}
        >
          {effectiveTitle}
        </div>
      {:else}
        <button
          class="inline-block px-0 py-0 font-semibold leading-none text-left transition-transform duration-100 ease-out origin-bottom-left rounded cursor-text whitespace-nowrap text-vsc-editor-fg"
          style:font-size={`${GROUP_TITLE_BASE_SIZE_PX}px`}
          style:transform={`scale(${titleCompensationScale})`}
          type="button"
          // ondblclick={() => (isEditingTitle = true)}
          onclick={() => (isEditingTitle = true)}
          aria-label={`Group title: ${effectiveTitle}. Double click to rename`}
        >
          {effectiveTitle}
        </button>
      {/if}
    </div>
  </div>

  <ZoomCompensatedNodeResizer
    isVisible={selected && !dragging}
    minWidth={MIN_GROUP_WIDTH}
    minHeight={MIN_GROUP_HEIGHT}
    onResizeEnd={handleResizeEnd}
  />
</div>
