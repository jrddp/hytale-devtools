<script>
  import { NodeResizer, useSvelteFlow, useViewport } from "@xyflow/svelte";
  import { tick } from "svelte";
  import { GROUP_MUTATION_EVENT } from "../node-editor/types.js";

  const DEFAULT_GROUP_NAME = "Group";
  const MIN_GROUP_WIDTH = 180;
  const MIN_GROUP_HEIGHT = 120;
  const GROUP_TITLE_BASE_SIZE_PX = 18;
  const GROUP_TITLE_MAX_COMPENSATION_SCALE = 3.5;
  const TITLEBAR_DRAG_DISTANCE_THRESHOLD_PX = 3;
  const DEBUG_GROUP_DRAG_STATE = true;

  let {
    id,
    data = {},
    selected = false,
    draggable: nodeDraggable = undefined,
    dragging = false,
    positionAbsoluteX = 0,
    positionAbsoluteY = 0,
  } = $props();

  const viewport = useViewport();
  const { updateNodeData, updateNode } = useSvelteFlow();

  let nodeName = $derived(readGroupName(data?.$groupName));
  let viewportZoom = $derived(readViewportZoom(viewport.current?.zoom));
  let titleCompensationScale = $derived(readCompensatedTitleScale(viewportZoom));
  let showInlineTitleDisplay = $derived(titleCompensationScale <= 1.001);
  let showTitlebarRenameHint = $derived(showInlineTitleDisplay && !isEditingTitle);

  let isEditingTitle = $state(false);
  let titleDraft = $state("");
  let titleInputElement = $state(undefined);
  let appliedDraggable = $state(undefined);
  let titlebarDragSession = $state(undefined);
  let previousSelected = $state(undefined);
  let previousNodeDraggable = $state(undefined);

  $effect(() => {
    if (!isEditingTitle) {
      titleDraft = nodeName;
    }
  });

  $effect(() => {
    if (previousSelected === selected) {
      return;
    }

    debugDragState("selected changed", {
      previousSelected,
      selected,
      nodeDraggable,
      appliedDraggable,
    });
    previousSelected = selected;
  });

  $effect(() => {
    if (previousNodeDraggable === nodeDraggable) {
      return;
    }

    debugDragState("draggable changed", {
      previousDraggable: previousNodeDraggable,
      nodeDraggable,
      selected,
      appliedDraggable,
    });
    previousNodeDraggable = nodeDraggable;
  });

  $effect(() => {
    const nextDraggable = Boolean(selected);
    if (appliedDraggable === nextDraggable) {
      return;
    }

    debugDragState("requesting draggable update", {
      selected,
      previousAppliedDraggable: appliedDraggable,
      nextDraggable,
      nodeDraggable,
    });

    appliedDraggable = nextDraggable;
    updateNode(id, {
      draggable: nextDraggable,
      dragHandle: undefined,
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

  function readFiniteNumber(candidateNumber) {
    const numericValue = Number(candidateNumber);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  function debugDragState(message, payload) {
    if (!DEBUG_GROUP_DRAG_STATE || typeof console === "undefined") {
      return;
    }

    console.log(`[GroupMetadataNode:${id}] ${message}`, payload);
  }
</script>

<div
  class="relative h-full w-full overflow-visible rounded-lg border border-dashed border-vsc-editor-widget-border bg-vsc-editor-widget-bg/40 transition-[border-color,box-shadow]"
  class:border-vsc-focus={selected && !dragging}
>
  <div class="absolute -top-8 left-2 z-20">
    {#if isEditingTitle}
      <input
        bind:this={titleInputElement}
        class="nodrag inline-block appearance-none origin-left whitespace-nowrap rounded border-0 bg-transparent px-0 py-0 text-left font-semibold leading-none text-vsc-editor-fg outline-none ring-0 transition-transform duration-100 ease-out placeholder:text-vsc-muted focus:outline-none focus:ring-0"
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
        class="nodrag inline-block origin-left whitespace-nowrap rounded px-0 py-0 text-left font-semibold leading-none text-vsc-editor-fg transition-transform duration-100 ease-out"
        style:font-size={`${GROUP_TITLE_BASE_SIZE_PX}px`}
        style:transform={`scale(${titleCompensationScale})`}
        type="button"
        ondblclick={beginTitleEditing}
        onkeydown={handleTitleDisplayKeydown}
        aria-label={`Group title: ${nodeName}. Double click to rename`}
      >
        {nodeName}
      </button>
    {/if}
  </div>

  <div
    class="group-title-drag-handle nopan absolute inset-x-0 top-0 flex h-8 items-center gap-1 rounded-t-lg bg-vsc-input-bg/60 px-2"
    role="presentation"
    onpointerdown={handleTitlebarPointerDown}
    onpointermove={handleTitlebarPointerMove}
    onpointerup={handleTitlebarPointerUp}
    onpointercancel={handleTitlebarPointerCancel}
  >
    <div
      class="flex min-w-0 items-center gap-1 text-[11px] text-vsc-muted transition-[opacity,transform] duration-200 ease-out"
      class:opacity-100={showTitlebarRenameHint}
      class:translate-y-0={showTitlebarRenameHint}
      class:opacity-0={!showTitlebarRenameHint}
      class:translate-y-0.5={!showTitlebarRenameHint}
      class:pointer-events-none={!showTitlebarRenameHint}
      aria-hidden={!showTitlebarRenameHint}
    >
      <span>Double click title to rename group</span>
    </div>
  </div>

  <div class="pointer-events-none absolute inset-x-0 top-8 h-px bg-vsc-editor-widget-border/80"></div>

  <NodeResizer
    isVisible={selected}
    minWidth={MIN_GROUP_WIDTH}
    minHeight={MIN_GROUP_HEIGHT}
    color={"var(--vscode-focusBorder)"}
    handleClass={"rounded-sm border border-vsc-focus bg-vsc-editor-widget-bg"}
    lineClass={"border-vsc-focus"}
    onResizeEnd={handleResizeEnd}
  />
</div>
