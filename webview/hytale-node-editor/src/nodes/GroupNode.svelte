<script lang="ts">
  import { useSvelteFlow, useViewport } from "@xyflow/svelte";
  import { Database, Pencil } from "lucide-svelte";
  import { tick } from "svelte";
  import ZoomCompensatedNodeResizer from "../components/ZoomCompensatedNodeResizer.svelte";
  import { type GroupNodeType } from "src/common";
  import { applyDocumentState } from "src/workspace.svelte";

  const MIN_GROUP_WIDTH = 180;
  const MIN_GROUP_HEIGHT = 120;
  const GROUP_TITLE_BASE_SIZE_PX = 18;
  const GROUP_TITLE_MAX_COMPENSATION_SCALE = 5.5;
  const TITLEBAR_DRAG_DISTANCE_THRESHOLD_PX = 3;

  let {
    id,
    position,
    data,
    selected = false,
    dragging = false,
    draggable = false,
    width = MIN_GROUP_WIDTH,
    height = MIN_GROUP_HEIGHT,
  }: GroupNodeType = $props();

  const viewport = useViewport();
  const { updateNodeData, updateNode } = useSvelteFlow();

  let isEditingTitle = $state(false);
  let titleDraft = $state("");
  let titleInputElement = $state(undefined);
  let titlebarDragSession = $state(undefined);

  let titleCompensationScale = $derived(readCompensatedTitleScale(viewport.current.zoom));
  let showInlineTitleDisplay = $derived(titleCompensationScale <= 1.001);
  let showInlineEditButton = $derived(showInlineTitleDisplay && !isEditingTitle);

  $effect(() => {
    if (!isEditingTitle) {
      titleDraft = data.name;
    }
  });

  $effect(() => {
    if (selected) {
      updateNode(id, { draggable: true });
    } else {
      updateNode(id, { draggable: false });
    }
  });

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

    updateName(titleDraft);
    isEditingTitle = false;
    applyDocumentState("group-renamed");
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

  function updateName(candidateName) {
    updateNodeData(id, { name: candidateName });
  }

  function handleResizeEnd() {
    applyDocumentState("group-resized");
  }

  function handleTitlebarPointerDown(event) {
    if (selected || isEditingTitle || event.button !== 0) {
      return;
    }

    const pointerTarget = event?.target;
    if (
      typeof pointerTarget?.closest === "function" &&
      pointerTarget.closest("[data-group-edit-action='true']")
    ) {
      return;
    }

    titlebarDragSession = {
      pointerId: event.pointerId,
      startClientX: Number(event.clientX) || 0,
      startClientY: Number(event.clientY) || 0,
      startNodeX: position.x,
      startNodeY: position.y,
      moved: false,
    };

    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function handleTitlebarPointerMove(event) {
    const dragSession = titlebarDragSession;
    if (!dragSession || event.pointerId !== dragSession.pointerId) {
      return;
    }

    const deltaClientX = (Number(event.clientX) || 0) - dragSession.startClientX;
    const deltaClientY = (Number(event.clientY) || 0) - dragSession.startClientY;
    const dragDistance = Math.hypot(deltaClientX, deltaClientY);
    const didMove = dragSession.moved || dragDistance >= TITLEBAR_DRAG_DISTANCE_THRESHOLD_PX;
    if (!didMove) {
      return;
    }

    if (!dragSession.moved) {
      titlebarDragSession = {
        ...dragSession,
        moved: true,
      };
    }

    const zoom = viewport.current.zoom;
    updateNode(id, {
      position: {
        x: dragSession.startNodeX + deltaClientX / zoom,
        y: dragSession.startNodeY + deltaClientY / zoom,
      },
    });

    event.preventDefault();
  }

  function handleTitlebarPointerUp(event) {
    const dragSession = titlebarDragSession;
    if (!dragSession || event.pointerId !== dragSession.pointerId) {
      return;
    }

    if (dragSession.moved) {
      updateNode(id, {
        selected: true,
      });
      applyDocumentState("group-moved");
      event.preventDefault();
    }

    titlebarDragSession = undefined;
  }

  function handleTitlebarPointerCancel(event) {
    const dragSession = titlebarDragSession;
    if (!dragSession || event.pointerId !== dragSession.pointerId) {
      return;
    }

    titlebarDragSession = undefined;
  }

  function readCompensatedTitleScale(zoom) {
    if (!Number.isFinite(zoom) || zoom >= 1) {
      return 1;
    }

    const inverseScale = 1 / zoom;
    return Math.min(GROUP_TITLE_MAX_COMPENSATION_SCALE, Math.max(1, inverseScale));
  }
</script>

<div
  class="relative h-full w-full cursor-grab overflow-visible rounded-lg border border-dashed border-vsc-editor-widget-border bg-vsc-editor-widget-bg/40 transition-[border-color,box-shadow]"
  class:cursor-grabbing={dragging}
  style="outline: {selected && !dragging ? '2px solid var(--vscode-focusBorder)' : 'none'};"
>
  <div
    class="absolute inset-x-0 top-0 flex items-end h-8 gap-1 px-2 pb-1 overflow-visible rounded-t-lg cursor-default group-title-drag-handle nopan bg-vsc-input-bg/60"
    role="presentation"
    onpointerdown={handleTitlebarPointerDown}
    onpointermove={handleTitlebarPointerMove}
    onpointerup={handleTitlebarPointerUp}
    onpointercancel={handleTitlebarPointerCancel}
  >
    <div class="flex items-end min-w-0 gap-1 overflow-visible">
      {#if isEditingTitle}
        <input
          bind:this={titleInputElement}
          class="inline-block max-w-full px-0 py-0 font-semibold leading-none text-left transition-transform duration-100 ease-out origin-bottom-left bg-transparent border-0 rounded outline-none appearance-none nodrag whitespace-nowrap text-vsc-editor-fg ring-0 placeholder:text-vsc-muted focus:outline-none focus:ring-0"
          style:font-size={`${GROUP_TITLE_BASE_SIZE_PX}px`}
          style:transform={`scale(${titleCompensationScale})`}
          type="text"
          value={titleDraft}
          size={Math.max(1, titleDraft.length || data.name.length)}
          oninput={event => (titleDraft = event.currentTarget.value)}
          onkeydown={handleTitleInputKeydown}
          onblur={commitTitleEditing}
          aria-label="Edit group title"
        />
      {:else}
        <button
          class="inline-block px-0 py-0 font-semibold leading-none text-left transition-transform duration-100 ease-out origin-bottom-left rounded cursor-default whitespace-nowrap text-vsc-editor-fg"
          style:font-size={`${GROUP_TITLE_BASE_SIZE_PX}px`}
          style:transform={`scale(${titleCompensationScale})`}
          type="button"
          ondblclick={beginTitleEditing}
          onkeydown={handleTitleDisplayKeydown}
          aria-label={`Group title: ${data.name}. Double click to rename`}
        >
          {data.name}
        </button>

        <button
          data-group-edit-action="true"
          class="nodrag inline-flex cursor-default items-center justify-center rounded p-0.5 text-vsc-muted transition-[opacity,transform,color] duration-200 ease-out hover:text-vsc-editor-fg"
          class:opacity-100={showInlineEditButton}
          class:translate-y-0={showInlineEditButton}
          class:opacity-0={!showInlineEditButton}
          class:translate-y-0.5={!showInlineEditButton}
          class:pointer-events-none={!showInlineEditButton}
          type="button"
          title="Edit group name"
          aria-label="Edit group name"
          onclick={beginTitleEditing}
          tabindex={showInlineEditButton ? 0 : -1}
        >
          <Pencil size={12} strokeWidth={2.25} aria-hidden="true" />
        </button>
      {/if}
    </div>
  </div>

  <div
    class="absolute inset-x-0 h-px pointer-events-none top-8 bg-vsc-editor-widget-border/80"
  ></div>

  <ZoomCompensatedNodeResizer
    isVisible={selected}
    minWidth={MIN_GROUP_WIDTH}
    minHeight={MIN_GROUP_HEIGHT}
    onResizeEnd={handleResizeEnd}
  />
</div>
