<script>
  import { NodeResizer, useSvelteFlow } from "@xyflow/svelte";
  import { Pencil } from "lucide-svelte";
  import { tick } from "svelte";
  import { GROUP_MUTATION_EVENT } from "../node-editor/types.js";

  export let id;
  export let data = {};
  export let selected = false;
  export let dragging = false;

  const DEFAULT_GROUP_NAME = "Group";
  const MIN_GROUP_WIDTH = 180;
  const MIN_GROUP_HEIGHT = 120;

  const { updateNodeData } = useSvelteFlow();

  $: nodeName = readGroupName(data?.$groupName);
  $: if (!isEditingTitle) {
    titleDraft = nodeName;
  }

  let isEditingTitle = false;
  let titleDraft = "";
  let titleInputElement;

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
</script>

<div
  class="relative h-full w-full rounded-lg border border-dashed border-vsc-editor-widget-border bg-vsc-editor-widget-bg/40 transition-[border-color,box-shadow]"
  class:border-vsc-focus={selected && !dragging}
>
  <div class="pointer-events-none absolute inset-x-0 top-8 h-px bg-vsc-editor-widget-border/80"></div>

  <div class="absolute inset-x-0 top-0 flex h-8 items-center gap-1 rounded-t-lg bg-vsc-input-bg/80 px-2">
    {#if isEditingTitle}
      <input
        bind:this={titleInputElement}
        class="nodrag h-6 w-full rounded border border-vsc-input-border bg-vsc-input-bg px-1.5 text-xs text-vsc-input-fg"
        type="text"
        value={titleDraft}
        oninput={(event) => (titleDraft = event.currentTarget.value)}
        onkeydown={handleTitleInputKeydown}
        onblur={commitTitleEditing}
      />
    {:else}
      <button
        class="nodrag min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-xs font-semibold text-vsc-editor-fg"
        type="button"
        ondblclick={beginTitleEditing}
        onkeydown={handleTitleDisplayKeydown}
      >
        {nodeName}
      </button>

      <button
        class="nodrag inline-flex items-center justify-center rounded p-0.5 text-vsc-muted hover:text-vsc-editor-fg"
        type="button"
        title="Edit group name"
        aria-label="Edit group name"
        onclick={beginTitleEditing}
      >
        <Pencil size={12} strokeWidth={2.25} aria-hidden="true" />
      </button>
    {/if}
  </div>

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
