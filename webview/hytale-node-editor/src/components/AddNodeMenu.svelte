<script>
  import { createEventDispatcher, tick } from 'svelte';

  export let open = false;
  export let openVersion = 0;
  export let position = { x: 0, y: 0 };
  export let templates = [];

  const dispatch = createEventDispatcher();

  let searchQuery = '';
  let searchInput;
  let menuElement;
  let activeIndex = 0;
  let lastSearchQuery = '';
  let lastFocusedOpenVersion = -1;

  $: if (open && openVersion !== lastFocusedOpenVersion) {
    searchQuery = '';
    activeIndex = 0;
    lastFocusedOpenVersion = openVersion;
    tick().then(() => searchInput?.focus());
  }

  $: filteredTemplates = templates.filter((template) => {
    const haystack = `${template.label} ${template.subtitle ?? ''} ${template.category ?? ''}`.toLowerCase();
    return haystack.includes(searchQuery.trim().toLowerCase());
  });

  $: groupedTemplateEntries = annotateGroupedTemplates(groupTemplates(filteredTemplates));
  $: flatTemplates = groupedTemplateEntries.flatMap((group) =>
    group.items.map((item) => item.template)
  );

  $: if (searchQuery !== lastSearchQuery) {
    lastSearchQuery = searchQuery;
    activeIndex = 0;
  }

  $: if (activeIndex >= flatTemplates.length) {
    activeIndex = Math.max(0, flatTemplates.length - 1);
  }

  $: if (open && flatTemplates.length > 0) {
    tick().then(() => {
      scrollActiveTemplateIntoView();
    });
  }

  function groupTemplates(sourceTemplates) {
    const grouped = new Map();

    for (const template of sourceTemplates) {
      const category = typeof template?.category === 'string' && template.category.trim()
        ? template.category.trim()
        : 'Other';

      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category).push(template);
    }

    return Array.from(grouped.entries()).map(([category, items]) => ({
      category,
      items,
    }));
  }

  function annotateGroupedTemplates(groups) {
    let nextFlatIndex = 0;
    return groups.map((group) => ({
      category: group.category,
      items: group.items.map((template) => ({
        template,
        flatIndex: nextFlatIndex++,
      })),
    }));
  }

  function selectTemplate(template) {
    dispatch('select', { template });
  }

  function closeMenu() {
    dispatch('close');
  }

  function handleKeyDown(event) {
    if (!open) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }

    if (flatTemplates.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      activeIndex = (activeIndex + 1) % flatTemplates.length;
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      activeIndex = (activeIndex - 1 + flatTemplates.length) % flatTemplates.length;
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      selectTemplate(flatTemplates[activeIndex] ?? flatTemplates[0]);
    }
  }

  function scrollActiveTemplateIntoView() {
    const activeItemElement = menuElement?.querySelector?.(
      '[data-add-node-menu-item="true"][data-active="true"]'
    );

    if (typeof activeItemElement?.scrollIntoView === 'function') {
      activeItemElement.scrollIntoView({ block: 'nearest' });
    }
  }

  function isActiveTemplate(flatIndex) {
    return activeIndex === flatIndex;
  }

  function setActiveTemplate(flatIndex) {
    if (flatIndex >= 0 && flatIndex < flatTemplates.length) {
      activeIndex = flatIndex;
    }
  }
</script>

{#if open}
  <div
    bind:this={menuElement}
    data-add-node-menu="true"
    role="dialog"
    aria-label="Add node menu"
    tabindex="-1"
    class="absolute z-3001 w-64 max-h-[70vh] translate-x-2 translate-y-2 overflow-hidden rounded-lg border border-vsc-editor-widget-border bg-vsc-editor-widget-bg p-2.5 text-vsc-editor-fg shadow-2xl"
    style:left={`${position.x}px`}
    style:top={`${position.y}px`}
    onkeydown={handleKeyDown}
  >
    <input
      bind:this={searchInput}
      class="w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
      type="search"
      bind:value={searchQuery}
      onkeydown={handleKeyDown}
      placeholder="Search nodes..."
    />

    <div class="mt-2 flex max-h-[calc(70vh-3.5rem)] flex-col gap-2 overflow-auto pr-0.5" role="listbox">
      {#if groupedTemplateEntries.length === 0}
        <div class="text-xs text-vsc-muted">No matching node types</div>
      {:else}
        {#each groupedTemplateEntries as group}
          <div class="flex flex-col gap-1.5">
            <div class="text-xs uppercase tracking-wide text-vsc-muted">
              {group.category}
            </div>
            {#each group.items as item (item.flatIndex)}
              <button
                data-add-node-menu-item="true"
                class="flex w-full cursor-pointer flex-col gap-0.5 rounded-md border border-vsc-editor-widget-border bg-vsc-button-secondary-bg px-2 py-1.5 text-left text-vsc-fg"
                class:border-vsc-focus={isActiveTemplate(item.flatIndex)}
                class:bg-vsc-list-active-bg={isActiveTemplate(item.flatIndex)}
                class:text-vsc-list-active-fg={isActiveTemplate(item.flatIndex)}
                data-active={isActiveTemplate(item.flatIndex)}
                aria-selected={isActiveTemplate(item.flatIndex)}
                role="option"
                type="button"
                onmouseenter={() => setActiveTemplate(item.flatIndex)}
                onclick={() => selectTemplate(item.template)}
              >
                <span class="text-xs font-semibold">{item.template.label}</span>
                {#if item.template.subtitle}
                  <span class="text-xs text-vsc-muted">
                    {item.template.subtitle}
                  </span>
                {/if}
              </button>
            {/each}
          </div>
        {/each}
      {/if}
    </div>
  </div>
{/if}
