<script>
  import { Panel } from "@xyflow/svelte";
  import { createEventDispatcher, tick } from "svelte";
  import { Search } from "lucide-svelte";
  import { filterNodeSearchGroups } from "../node-editor/nodeSearch.js";

  export let open = false;
  export let openVersion = 0; // Used to trigger re-focusing when menu is re-opened.
  export let groups = [];

  const dispatch = createEventDispatcher();

  let searchQuery = "";
  let searchInput;
  let menuElement;
  let resultListElement;
  let activeIndex = 0;
  let hasHardSelection = false;
  let lastSearchQuery = "";
  let lastFocusedOpenVersion = -1;
  let lastPreviewedNodeId = undefined;

  $: normalizedGroups = Array.isArray(groups) ? groups : [];
  $: filteredGroups = filterNodeSearchGroups(normalizedGroups, searchQuery);
  $: groupedEntries = annotateGroupedEntries(filteredGroups);
  $: flatItems = groupedEntries.flatMap((group) => group.items.map((item) => item.entry));

  $: if (open && openVersion !== lastFocusedOpenVersion) {
    searchQuery = "";
    activeIndex = 0;
    hasHardSelection = false;
    lastFocusedOpenVersion = openVersion;
    lastPreviewedNodeId = undefined;
    tick().then(() => searchInput?.focus());
  }

  $: if (searchQuery !== lastSearchQuery) {
    lastSearchQuery = searchQuery;
    activeIndex = 0;
    hasHardSelection = false;
    lastPreviewedNodeId = undefined;
  }

  $: if (activeIndex >= flatItems.length) {
    activeIndex = Math.max(0, flatItems.length - 1);
  }

  $: if (flatItems.length === 0) {
    activeIndex = 0;
    hasHardSelection = false;
    lastPreviewedNodeId = undefined;
  }

  $: if (flatItems.length === 1 && open) {
    hasHardSelection = true;
  }

  $: if (open && flatItems.length > 0 && activeIndex >= 0) {
    tick().then(() => {
      scrollActiveResultIntoView();
    });
  }

  $: if (open && hasHardSelection && flatItems.length > 0) {
    const activeItem = flatItems[activeIndex] ?? flatItems[0];
    const activeNodeId = normalizeOptionalString(activeItem?.nodeId);
    if (activeNodeId && activeNodeId !== lastPreviewedNodeId) {
      lastPreviewedNodeId = activeNodeId;
      dispatch("preview", { nodeId: activeNodeId });
    }
  }

  $: if (!open) {
    lastPreviewedNodeId = undefined;
  }

  function annotateGroupedEntries(sourceGroups) {
    let nextFlatIndex = 0;
    return sourceGroups.map((group) => ({
      id: group?.id,
      label: group?.label,
      items: (Array.isArray(group?.items) ? group.items : []).map((entry) => ({
        entry,
        flatIndex: nextFlatIndex++,
      })),
    }));
  }

  function scrollActiveResultIntoView() {
    const itemElements = resultListElement?.querySelectorAll?.('[data-node-search-item="true"]');
    const activeItemElement = itemElements?.[activeIndex];

    if (!resultListElement || !activeItemElement) {
      return;
    }

    const itemTop = activeItemElement.offsetTop;
    const itemBottom = itemTop + activeItemElement.offsetHeight;
    const viewTop = resultListElement.scrollTop;
    const viewBottom = viewTop + resultListElement.clientHeight;

    if (itemTop < viewTop) {
      resultListElement.scrollTop = itemTop;
      return;
    }

    if (itemBottom > viewBottom) {
      resultListElement.scrollTop = itemBottom - resultListElement.clientHeight;
    }
  }

  function isActiveResult(flatIndex) {
    return activeIndex === flatIndex;
  }

  function isHardActiveResult(flatIndex) {
    return hasHardSelection && isActiveResult(flatIndex);
  }

  function isSoftActiveResult(flatIndex) {
    return !hasHardSelection && flatItems.length > 1 && isActiveResult(flatIndex);
  }

  function setHardActiveResult(flatIndex) {
    if (flatIndex < 0 || flatIndex >= flatItems.length) {
      return;
    }

    activeIndex = flatIndex;
    hasHardSelection = true;
  }

  function selectResult(entry) {
    const nodeId = normalizeOptionalString(entry?.nodeId);
    if (!nodeId) {
      return;
    }

    dispatch("select", { nodeId });
  }

  function handleCloseRequest() {
    dispatch("close");
  }

  function handleKeyDown(event) {
    if (!open) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      handleCloseRequest();
      return;
    }

    if (flatItems.length === 0) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();

      if (!hasHardSelection && flatItems.length > 1) {
        hasHardSelection = true;
        tick().then(() => scrollActiveResultIntoView());
        return;
      }

      const delta = event.key === "ArrowDown" ? 1 : -1;
      activeIndex = (activeIndex + delta + flatItems.length) % flatItems.length;
      hasHardSelection = true;
      tick().then(() => scrollActiveResultIntoView());
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      selectResult(flatItems[activeIndex] ?? flatItems[0]);
    }
  }

  function readItemColor(entry) {
    return normalizeOptionalString(entry?.color) ?? "var(--vscode-descriptionForeground)";
  }

  function normalizeOptionalString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }
</script>

{#if open}
  <Panel position="top-left" class="pointer-events-auto">
    <div
      bind:this={menuElement}
      data-node-search-menu="true"
      role="dialog"
      aria-label="Search nodes"
      tabindex="-1"
      class="mt-2 ml-2 w-[30rem] max-w-[92vw] max-h-[72vh] overflow-hidden rounded-xl border border-vsc-editor-widget-border bg-vsc-editor-widget-bg p-3 text-vsc-editor-fg shadow-2xl"
      onkeydown={handleKeyDown}
    >
      <div class="relative">
        <Search
          aria-hidden="true"
          size={14}
          strokeWidth={2}
          class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-vsc-muted"
        />
        <input
          bind:this={searchInput}
          class="w-full rounded-md border border-vsc-input-border bg-vsc-input-bg pr-2 py-1.5 pl-9 text-xs text-vsc-input-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
          type="search"
          bind:value={searchQuery}
          onkeydown={handleKeyDown}
          placeholder="Type a node name or group"
        />
      </div>

      <div
        bind:this={resultListElement}
        class="relative mt-3 flex max-h-[calc(72vh-4.75rem)] flex-col gap-3 overflow-auto pr-0.5"
        role="listbox"
      >
        {#if groupedEntries.length === 0}
          <div class="px-1 py-4 text-xs text-vsc-muted">No matching nodes</div>
        {:else}
          {#each groupedEntries as group}
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center gap-2 px-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-vsc-muted">
                <span class="truncate">{group.label}</span>
                <span class="h-px flex-1 bg-vsc-editor-widget-border"></span>
              </div>

              {#each group.items as item (item.flatIndex)}
                <button
                  data-node-search-item="true"
                  data-active={isActiveResult(item.flatIndex)}
                  role="option"
                  aria-selected={isHardActiveResult(item.flatIndex)}
                  type="button"
                  class="group flex w-full cursor-pointer items-center gap-2 overflow-hidden rounded-lg border border-vsc-editor-widget-border bg-vsc-button-secondary-bg px-2 py-1.5 text-left text-vsc-button-secondary-fg transition-[border-color,background-color,color]"
                  class:border-vsc-focus={isSoftActiveResult(item.flatIndex) || isHardActiveResult(item.flatIndex)}
                  class:bg-vsc-list-active-bg={isHardActiveResult(item.flatIndex)}
                  class:text-vsc-list-active-fg={isHardActiveResult(item.flatIndex)}
                  onmouseenter={() => setHardActiveResult(item.flatIndex)}
                  onclick={() => selectResult(item.entry)}
                >
                  <span
                    aria-hidden="true"
                    class="h-3 w-3 shrink-0 rounded-full border border-vsc-editor-widget-border"
                    style="background-color: {readItemColor(item.entry)};"
                  ></span>

                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-xs font-semibold">{item.entry.label}</span>
                  </span>
                </button>
              {/each}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </Panel>
{/if}
