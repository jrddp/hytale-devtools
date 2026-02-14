<script>
  import { createEventDispatcher, tick } from 'svelte';

  export let open = false;
  export let openVersion = 0;
  export let position = { x: 0, y: 0 };
  export let templates = [];

  const dispatch = createEventDispatcher();

  let searchQuery = '';
  let searchInput;
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

  $: groupedTemplates = groupTemplates(filteredTemplates);
  $: flatTemplates = groupedTemplates.flatMap((group) => group.items);

  $: if (searchQuery !== lastSearchQuery) {
    lastSearchQuery = searchQuery;
    activeIndex = 0;
  }

  $: if (activeIndex >= flatTemplates.length) {
    activeIndex = Math.max(0, flatTemplates.length - 1);
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

    return Array.from(grouped.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, items]) => ({
        category,
        items: items.sort((left, right) => left.label.localeCompare(right.label)),
      }));
  }

  function selectTemplate(template) {
    dispatch('select', { template });
  }

  function closeMenu() {
    dispatch('close');
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      closeMenu();
      return;
    }

    if (event.key === 'ArrowDown' && flatTemplates.length > 0) {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % flatTemplates.length;
      return;
    }

    if (event.key === 'ArrowUp' && flatTemplates.length > 0) {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + flatTemplates.length) % flatTemplates.length;
      return;
    }

    if (event.key === 'Enter' && flatTemplates.length > 0) {
      event.preventDefault();
      selectTemplate(flatTemplates[activeIndex] ?? flatTemplates[0]);
    }
  }

  function isActiveTemplate(template) {
    return (flatTemplates[activeIndex]?.templateId ?? '') === template?.templateId;
  }

  function setActiveTemplate(template) {
    const nextIndex = flatTemplates.findIndex(
      (entry) => entry?.templateId && entry.templateId === template?.templateId
    );

    if (nextIndex >= 0) {
      activeIndex = nextIndex;
    }
  }
</script>

{#if open}
  <div
    class="absolute z-40 w-64 max-h-[70vh] translate-x-2 translate-y-2 overflow-hidden rounded-lg border border-vsc-editor-widget-border bg-vsc-editor-widget-bg p-2.5 text-vsc-editor-fg shadow-2xl"
    style:left={`${position.x}px`}
    style:top={`${position.y}px`}
  >
    <input
      bind:this={searchInput}
      class="w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
      type="search"
      bind:value={searchQuery}
      onkeydown={handleKeyDown}
      placeholder="Search nodes..."
    />

    <div class="mt-2 flex max-h-[calc(70vh-3.5rem)] flex-col gap-2 overflow-auto pr-0.5">
      {#if groupedTemplates.length === 0}
        <div class="text-xs text-vsc-muted">No matching node types</div>
      {:else}
        {#each groupedTemplates as group}
          <div class="flex flex-col gap-1.5">
            <div class="text-xs uppercase tracking-wide text-vsc-muted">
              {group.category}
            </div>
            {#each group.items as template}
              <button
                class="flex w-full cursor-pointer flex-col gap-0.5 rounded-md border border-vsc-editor-widget-border bg-vsc-button-secondary-bg px-2 py-1.5 text-left text-vsc-fg hover:border-vsc-focus hover:bg-vsc-list-hover data-[active=true]:border-vsc-focus data-[active=true]:bg-vsc-list-active-bg data-[active=true]:text-vsc-list-active-fg"
                data-active={isActiveTemplate(template)}
                type="button"
                onmouseenter={() => setActiveTemplate(template)}
                onclick={() => selectTemplate(template)}
              >
                <span class="text-xs font-semibold">{template.label}</span>
                {#if template.subtitle}
                  <span class="text-xs text-vsc-muted">
                    {template.subtitle}
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
