<script>
  import { NodeResizer, useSvelteFlow, useViewport } from "@xyflow/svelte";
  import { Pencil } from "lucide-svelte";
  import { tick } from "svelte";
  import { GROUP_MUTATION_EVENT } from "../node-editor/types.js";

  const DEFAULT_GROUP_NAME = "Group";
  const MIN_GROUP_WIDTH = 180;
  const MIN_GROUP_HEIGHT = 120;
  const GROUP_TITLE_BASE_SIZE_PX = 18;
  const GROUP_TITLE_MAX_COMPENSATION_SCALE = 3.5;
  const TITLEBAR_DRAG_DISTANCE_THRESHOLD_PX = 3;
  const RESIZER_HANDLE_BASE_SIZE_PX = 8;
  const RESIZER_HANDLE_MAX_COMPENSATION_SCALE = 3.5;
  const GROUP_Z_INDEX_UNSELECTED = -10000;
  const GROUP_Z_INDEX_SELECTED = 10000;

  let {
    id,
    data = {},
    selected = false,
    dragging = false,
    positionAbsoluteX = 0,
    positionAbsoluteY = 0,
  } = $props();

  const viewport = useViewport();
  const { updateNodeData, updateNode } = useSvelteFlow();

  let nodeName = $derived(readGroupName(data?.$groupName));
  let viewportZoom = $derived(readViewportZoom(viewport.current?.zoom));
  let titleCompensationScale = $derived(readCompensatedTitleScale(viewportZoom));
  let resizerHandleCompensationScale = $derived(readResizerHandleCompensationScale(viewportZoom));
  let resizerHandleSizePx = $derived(
    Math.round(RESIZER_HANDLE_BASE_SIZE_PX * resizerHandleCompensationScale)
  );
  let resizerHandleStyle = $derived(
    `width:${resizerHandleSizePx}px;height:${resizerHandleSizePx}px;`
  );
  let showInlineTitleDisplay = $derived(titleCompensationScale <= 1.001);
  let showInlineEditButton = $derived(showInlineTitleDisplay && !isEditingTitle);

  let isEditingTitle = $state(false);
  let titleDraft = $state("");
  let titleInputElement = $state(undefined);
  let appliedDraggable = $state(undefined);
  let appliedZIndex = $state(undefined);
  let titlebarDragSession = $state(undefined);

  $effect(() => {
    if (!isEditingTitle) {
      titleDraft = nodeName;
    }
  });

  $effect(() => {
    const nextDraggable = Boolean(selected);
    const nextZIndex = selected ? GROUP_Z_INDEX_SELECTED : GROUP_Z_INDEX_UNSELECTED;
    if (appliedDraggable === nextDraggable && appliedZIndex === nextZIndex) {
      return;
    }

    appliedDraggable = nextDraggable;
    appliedZIndex = nextZIndex;
    updateNode(id, {
      draggable: nextDraggable,
      dragHandle: undefined,
      zIndex: nextZIndex,
    });
  });

  async function beginTitleEditing() {
    isEditingTitle = true;
    titleDraft = nodeName;
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
    notifyGroupMutation("group-renamed");
  }

  function cancelTitleEditing() {
    if (!isEditingTitle) {
      return;
    }

    isEditingTitle = false;
    titleDraft = nodeName;
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
    const normalizedName = readGroupName(candidateName);
    updateNodeData(id, { $groupName: normalizedName });
  }

  function handleResizeEnd() {
    notifyGroupMutation("group-resized");
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
      startNodeX: readFiniteNumber(positionAbsoluteX),
      startNodeY: readFiniteNumber(positionAbsoluteY),
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

    const zoom = readViewportZoom(viewport.current?.zoom);
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
      notifyGroupMutation("group-moved");
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

  function notifyGroupMutation(reason) {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(GROUP_MUTATION_EVENT, {
        detail: {
          nodeId: id,
          reason,
        },
      })
    );
  }

  function readGroupName(candidateName) {
    return typeof candidateName === "string" && candidateName.trim()
      ? candidateName.trim()
      : DEFAULT_GROUP_NAME;
  }

  function readViewportZoom(candidateZoom) {
    const zoom = Number(candidateZoom);
    if (!Number.isFinite(zoom) || zoom <= 0) {
      return 1;
    }

    return zoom;
  }

  function readCompensatedTitleScale(zoom) {
    if (!Number.isFinite(zoom) || zoom >= 1) {
      return 1;
    }

    const inverseScale = 1 / zoom;
    return Math.min(GROUP_TITLE_MAX_COMPENSATION_SCALE, Math.max(1, inverseScale));
  }

  function readResizerHandleCompensationScale(zoom) {
    if (!Number.isFinite(zoom) || zoom >= 1) {
      return 1;
    }

    const inverseScale = 1 / zoom;
    return Math.min(RESIZER_HANDLE_MAX_COMPENSATION_SCALE, Math.max(1, inverseScale));
  }

  function readFiniteNumber(candidateNumber) {
    const numericValue = Number(candidateNumber);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }
</script>

<div
  class="relative h-full w-full cursor-grab overflow-visible rounded-lg border border-dashed border-vsc-editor-widget-border bg-vsc-editor-widget-bg/40 transition-[border-color,box-shadow]"
  class:border-vsc-focus={selected && !dragging}
  class:cursor-grabbing={dragging}
>
  <div
    class="group-title-drag-handle nopan absolute inset-x-0 top-0 flex h-8 cursor-default items-end gap-1 overflow-visible rounded-t-lg bg-vsc-input-bg/60 px-2 pb-1"
    role="presentation"
    onpointerdown={handleTitlebarPointerDown}
    onpointermove={handleTitlebarPointerMove}
    onpointerup={handleTitlebarPointerUp}
    onpointercancel={handleTitlebarPointerCancel}
  >
    <div class="flex min-w-0 items-end gap-1 overflow-visible">
      {#if isEditingTitle}
        <input
          bind:this={titleInputElement}
          class="nodrag inline-block max-w-full appearance-none origin-bottom-left whitespace-nowrap rounded border-0 bg-transparent px-0 py-0 text-left font-semibold leading-none text-vsc-editor-fg outline-none ring-0 transition-transform duration-100 ease-out placeholder:text-vsc-muted focus:outline-none focus:ring-0"
          style:font-size={`${GROUP_TITLE_BASE_SIZE_PX}px`}
          style:transform={`scale(${titleCompensationScale})`}
          type="text"
          value={titleDraft}
          size={Math.max(1, titleDraft.length || nodeName.length)}
          oninput={(event) => (titleDraft = event.currentTarget.value)}
          onkeydown={handleTitleInputKeydown}
          onblur={commitTitleEditing}
          aria-label="Edit group title"
        />
      {:else}
        <button
          class="inline-block cursor-default origin-bottom-left whitespace-nowrap rounded px-0 py-0 text-left font-semibold leading-none text-vsc-editor-fg transition-transform duration-100 ease-out"
          style:font-size={`${GROUP_TITLE_BASE_SIZE_PX}px`}
          style:transform={`scale(${titleCompensationScale})`}
          type="button"
          ondblclick={beginTitleEditing}
          onkeydown={handleTitleDisplayKeydown}
          aria-label={`Group title: ${nodeName}. Double click to rename`}
        >
          {nodeName}
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

  <div class="pointer-events-none absolute inset-x-0 top-8 h-px bg-vsc-editor-widget-border/80"></div>

  <NodeResizer
    isVisible={selected}
    autoScale={false}
    minWidth={MIN_GROUP_WIDTH}
    minHeight={MIN_GROUP_HEIGHT}
    color={"var(--vscode-focusBorder)"}
    handleClass={"rounded-sm border border-vsc-focus bg-vsc-editor-widget-bg"}
    handleStyle={resizerHandleStyle}
    lineClass={"border-vsc-focus"}
    onResizeEnd={handleResizeEnd}
  />
</div>
