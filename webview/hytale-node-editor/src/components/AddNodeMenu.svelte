<script lang="ts">
  import { type NodeTemplate } from "@shared/node-editor/workspaceTypes";
  import { XYPosition } from "@xyflow/svelte";
  import { readColorForCss } from "src/node-editor/utils/colors";
  import { GENERIC_TEMPLATES } from "src/node-editor/utils/nodeFactory.svelte";
  import { workspace } from "src/workspace.svelte";
  import { onMount } from "svelte";

  export type AddMenuProps = {
    screenPosition: XYPosition;
    // Variant Kind ID or Template ID. Implies there is a source connection to attach new node to as the child.
    connectionFilter: string | undefined;
    oncancel?: () => void;
    onselection?: (template: NodeTemplate) => void;
  };

  const { screenPosition, connectionFilter, oncancel, onselection }: AddMenuProps = $props();

  let searchQuery = $state("");
  let activeIndex = $state(0);
  let searchInput: HTMLInputElement | undefined = $state();
  let resultListElement: HTMLElement | undefined = $state();

  let availableTemplates = $derived.by(() => [
    ...(connectionFilter
      ? GENERIC_TEMPLATES.filter(template => template.inputPins) // only allow templates that can connect
      : GENERIC_TEMPLATES),
    ...workspace.getValidTemplates(connectionFilter),
  ]);

  let searchedTemplatesUnordered = $derived(
    availableTemplates.filter(template => {
      const haystack = `${template.defaultTitle} ${template.category ?? ""}`.toLowerCase();
      return haystack.includes(searchQuery.trim().toLowerCase());
    }),
  );

  let searchedTemplatesByCategory = $derived(
    searchedTemplatesUnordered.reduce((map, template) => {
      const category = template.category ?? "Uncategorized";
      if (!map.has(category)) {
        map.set(category, []);
      }
      map.get(category)!.push(template);
      return map;
    }, new Map<string, NodeTemplate[]>()),
  );

  let searchedTemplates = $derived(Array.from(searchedTemplatesByCategory.values()).flat());

  let indexByTemplateId = $derived(
    new Map(searchedTemplates.map((template, index) => [template.templateId, index])),
  );

  let activeTemplate = $derived(searchedTemplates.at(activeIndex));

  // reset index any time searchQuery changes
  $effect(() => {
    void searchQuery;
    activeIndex = 0;
  });

  onMount(() => {
    searchInput.focus();
  });

  function handleKeyDown(event) {
    switch (event.key) {
      case "Escape":
        oncancel();
        break;
      case "Enter":
        if (searchedTemplates.length === 0) return;
        onselection(activeTemplate);
        break;
      case "ArrowDown":
        if (searchedTemplates.length === 0) return;
        activeIndex = (activeIndex + 1) % searchedTemplates.length;
        console.log(searchedTemplates.length);
        queueMicrotask(() => scrollActiveTemplateIntoView());
        break;
      case "ArrowUp":
        if (searchedTemplates.length === 0) return;
        activeIndex = (activeIndex - 1 + searchedTemplates.length) % searchedTemplates.length;
        queueMicrotask(() => scrollActiveTemplateIntoView());
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function scrollActiveTemplateIntoView() {
    const activeItemElement = resultListElement.querySelector('[data-active="true"]');
    activeItemElement?.scrollIntoView({ block: "nearest" });
  }
</script>

<div
  role="dialog"
  aria-label="Add node menu"
  tabindex="-1"
  class="absolute z-3001 w-64 max-h-[70vh] translate-x-2 translate-y-2 overflow-hidden rounded-lg border border-vsc-editor-widget-border bg-vsc-editor-widget-bg p-2.5 text-vsc-editor-fg shadow-2xl"
  style:left={`${screenPosition.x}px`}
  style:top={`${screenPosition.y}px`}
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

  <div
    bind:this={resultListElement}
    class="relative mt-2 flex max-h-[calc(70vh-3.5rem)] flex-col gap-2 overflow-y-scroll pr-0.5"
    role="listbox"
  >
    {#if searchedTemplatesByCategory.size === 0}
      <div class="text-xs text-vsc-muted">No matching node types</div>
    {:else}
      {#each searchedTemplatesByCategory.entries() as [category, templates] (category)}
        <div class="flex flex-col gap-1.5">
          <div
            class="flex items-center gap-2 px-1 text-[0.65rem] font-semibold uppercase tracking-widest text-vsc-muted sticky top-0 bg-vsc-editor-widget-bg w-full z-10 pb-1 -mb-1"
          >
            <span>{category}</span>
            <span class="flex-1 h-px bg-vsc-editor-widget-border"></span>
          </div>
          {#each templates as template (template.templateId)}
            {@const isActive = template.templateId === activeTemplate.templateId}
            <button
              class="group flex w-full cursor-pointer items-center gap-2 rounded-lg border border-vsc-editor-widget-border bg-vsc-button-secondary-bg text-left text-vsc-button-secondary-fg transition-[border-color,background-color,color] overflow-clip"
              class:border-vsc-focus={isActive}
              class:bg-vsc-list-active-bg={isActive}
              class:text-vsc-list-active-fg={isActive}
              data-active={isActive}
              aria-selected={isActive}
              role="option"
              type="button"
              onpointermove={() => (activeIndex = indexByTemplateId.get(template.templateId))}
              onclick={() => onselection(template)}
            >
              <span
                aria-hidden="true"
                class="relative h-8 w-2.5"
                style="background-color: {readColorForCss(template.nodeColor)};"
              ></span>

              <span class="flex-1 min-w-0">
                <span class="block text-xs font-semibold truncate">{template.defaultTitle}</span>
              </span>
            </button>
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</div>
