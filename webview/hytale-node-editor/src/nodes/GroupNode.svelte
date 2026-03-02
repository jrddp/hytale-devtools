<script lang="ts">
  import { useSvelteFlow, useViewport } from "@xyflow/svelte";
  import { Pencil } from "lucide-svelte";
  import { type GroupNodeType } from "src/common";
  import ZoomCompensatedNodeResizer from "src/components/ZoomCompensatedNodeResizer.svelte";
  import { MIN_GROUP_HEIGHT, MIN_GROUP_WIDTH } from "src/constants";
  import { isPlainEnterNavigationEvent } from "src/node-editor/ui/focusNavigation";
  import { applyDocumentState, workspace } from "src/workspace.svelte";
  import { tick } from "svelte";

  const GROUP_TITLE_BASE_SIZE_PX = 18;
  const GROUP_TITLE_MAX_COMPENSATION_SCALE = 12;

  let { id, data, selected = false, dragging = false }: GroupNodeType = $props();

  const viewport = useViewport();
  const { updateNodeData, updateNode } = useSvelteFlow();

  const groupLabel = $derived(readGroupLabel(data));
  const titleCompensationScale = $derived(readCompensatedTitleScale(viewport.current.zoom));

  let isEditingTitle = $state(false);
  let titleDraft = $state("");
  let titleInputElement = $state<HTMLInputElement | undefined>();
  let hoveringTitlebar = $state(false);
  let lastAppliedDraggable = $state<boolean | undefined>();

  $effect(() => {
    if (!isEditingTitle) {
      titleDraft = groupLabel;
    }
  });

  $effect(() => {
    const nextDraggable = workspace.controlScheme === "mouse" ? selected || hoveringTitlebar : true;
    if (lastAppliedDraggable === nextDraggable) {
      return;
    }

    lastAppliedDraggable = nextDraggable;
    updateNode(id, { draggable: nextDraggable });
  });

  async function beginTitleEditing() {
    isEditingTitle = true;
    titleDraft = groupLabel;
    await tick();
    titleInputElement?.focus();
    titleInputElement?.select();
  }

  function commitTitleEditing() {
    if (!isEditingTitle) {
      return;
    }

    const nextTitle = titleDraft;
    const didChange = nextTitle !== groupLabel;
    if (didChange) {
      updateNodeData(id, { titleOverride: nextTitle });
      applyDocumentState("group-renamed");
    }

    isEditingTitle = false;
  }

  function cancelTitleEditing() {
    if (!isEditingTitle) {
      return;
    }

    isEditingTitle = false;
    titleDraft = groupLabel;
  }

  function handleTitleInputKeydown(event: KeyboardEvent) {
    if (isPlainEnterNavigationEvent(event)) {
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
    applyDocumentState("group-resized");
  }

  function readGroupLabel(groupData: Record<string, unknown>) {
    if (typeof groupData?.titleOverride === "string") {
      return groupData.titleOverride;
    }
    if (typeof groupData?.name === "string") {
      return groupData.name;
    }
    if (typeof groupData?.defaultTitle === "string") {
      return groupData.defaultTitle;
    }
    return "Group";
  }

  function readCompensatedTitleScale(candidateZoom: unknown) {
    const zoom = Number(candidateZoom);
    if (!Number.isFinite(zoom) || zoom >= 1) {
      return 1;
    }

    const inverseScale = 1 / zoom;
    return Math.min(GROUP_TITLE_MAX_COMPENSATION_SCALE, Math.max(1, inverseScale));
  }
</script>

<div
  class="relative h-full w-full overflow-visible rounded-lg border border-dashed border-vsc-editor-widget-border bg-vsc-editor-widget-bg/40 text-vsc-editor-fg transition-[border-color,box-shadow]"
  class:cursor-grabbing={dragging}
  style="outline: {selected && !dragging ? '2px solid var(--vscode-focusBorder)' : 'none'};"
>
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
          class="inline-block max-w-full px-0 py-0 font-semibold leading-none text-left transition-transform duration-100 ease-out origin-bottom-left bg-transparent border-0 rounded outline-none appearance-none nodrag whitespace-nowrap text-vsc-editor-fg ring-0 placeholder:text-vsc-muted focus:outline-none focus:ring-0"
          style:font-size={`${GROUP_TITLE_BASE_SIZE_PX}px`}
          style:transform={`scale(${titleCompensationScale})`}
          type="text"
          aria-label="Edit group title"
          value={titleDraft}
          size={Math.max(1, titleDraft.length || groupLabel.length)}
          oninput={event => (titleDraft = event.currentTarget.value)}
          onkeydown={handleTitleInputKeydown}
          onblur={commitTitleEditing}
        />
      {:else}
        <button
          class="inline-block px-0 py-0 font-semibold leading-none text-left transition-transform duration-100 ease-out origin-bottom-left rounded cursor-grab active:cursor-grabbing whitespace-nowrap text-vsc-editor-fg"
          style:font-size={`${GROUP_TITLE_BASE_SIZE_PX}px`}
          style:transform={`scale(${titleCompensationScale})`}
          type="button"
          ondblclick={beginTitleEditing}
          onkeydown={handleTitleDisplayKeydown}
          aria-label={`Group title: ${groupLabel}. Double click to rename`}
        >
          {groupLabel}
        </button>

        <button
          class="inline-flex items-center justify-center rounded-md nodrag size-4 hover:backdrop-brightness-90"
          type="button"
          title="Edit group name"
          aria-label="Edit group name"
          onclick={beginTitleEditing}
        >
          <Pencil strokeWidth={2.5} aria-hidden="true" />
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
