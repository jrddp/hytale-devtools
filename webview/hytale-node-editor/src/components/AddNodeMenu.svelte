<script lang="ts">
  import { tick } from "svelte";
  import { workspace } from "../workspace.svelte";
  import { type NodeTemplate } from "@shared/node-editor/workspaceTypes";
  import {
    COMMENT_TEMPLATE_ID,
    GENERIC_CATEGORY,
    GROUP_TEMPLATE_ID,
    LINK_TEMPLATE_ID,
    RAW_JSON_TEMPLATE_ID,
  } from "src/common";
  import { readColorForCss } from "src/node-editor/utils/colors";

  let {
    open = false,
    openVersion = 0,
    position = { x: 0, y: 0 },
    onclose,
    onselect,
  }: {
    open: boolean;
    openVersion: number;
    position: { x: number; y: number };
    onclose: () => void;
    onselect: (template: NodeTemplate) => void;
  } = $props();

  interface IndexedTemplate {
    flatIndex: number;
    template: NodeTemplate;
  }

  let searchQuery = $state("");
  let searchInput: HTMLInputElement | undefined = $state();
  let menuElement: HTMLElement | undefined = $state();
  let resultListElement: HTMLElement | undefined = $state();
  let activeIndex = 0;
  let lastSearchQuery = "";
  let lastFocusedOpenVersion = -1;

  const GENERIC_TEMPLATES: NodeTemplate[] = [
    {
      templateId: GROUP_TEMPLATE_ID,
      defaultTitle: "Add Group",
      childTypes: {},
      fieldsBySchemaKey: {},
      inputPins: [],
      outputPins: [],
      schemaConstants: {},
      category: GENERIC_CATEGORY,
    },
    {
      templateId: COMMENT_TEMPLATE_ID,
      defaultTitle: "Add Comment",
      childTypes: {},
      fieldsBySchemaKey: {},
      inputPins: [],
      outputPins: [],
      schemaConstants: {},
      category: GENERIC_CATEGORY,
    },
    {
      templateId: LINK_TEMPLATE_ID,
      defaultTitle: "Add Link",
      childTypes: {},
      fieldsBySchemaKey: {},
      inputPins: [],
      outputPins: [],
      schemaConstants: {},
      category: GENERIC_CATEGORY,
    },
    {
      templateId: RAW_JSON_TEMPLATE_ID,
      defaultTitle: "Raw JSON Node",
      childTypes: {},
      fieldsBySchemaKey: {},
      inputPins: [],
      outputPins: [],
      schemaConstants: {},
      category: GENERIC_CATEGORY,
    },
  ];

  let availableTemplates = $derived([
    ...GENERIC_TEMPLATES,
    ...(workspace.context ? Object.values(workspace.context.nodeTemplatesById) : []),
  ]);

  let filteredTemplates = $derived(
    availableTemplates
      .filter(template => {
        const haystack = `${template.defaultTitle} ${template.category ?? ""}`.toLowerCase();
        return haystack.includes(searchQuery.trim().toLowerCase());
      })
      .map((template, index) => ({ flatIndex: index, template }) as IndexedTemplate),
  );

  let filteredTemplatesByCategory = $derived(
    filteredTemplates.reduce(
      (dict, idxTemplate) => {
        const category = idxTemplate.template.category ?? "Uncategorized";
        return { ...dict, [category]: [...(dict[category] ?? []), idxTemplate] };
      },
      {} as Record<string, IndexedTemplate[]>,
    ),
  );

  $effect(() => {
    if (open && openVersion !== lastFocusedOpenVersion) {
      searchQuery = "";
      activeIndex = 0;
      lastFocusedOpenVersion = openVersion;
      tick().then(() => searchInput?.focus());
    }
  });

  $effect(() => {
    if (searchQuery !== lastSearchQuery) {
      lastSearchQuery = searchQuery;
      activeIndex = 0;
    }
  });

  $effect(() => {
    if (activeIndex >= filteredTemplates.length) {
      activeIndex = Math.max(0, filteredTemplates.length - 1);
    }
  });

  $effect(() => {
    if (open && filteredTemplates.length > 0 && activeIndex >= 0) {
      tick().then(() => {
        scrollActiveTemplateIntoView();
      });
    }
  });

  function handleKeyDown(event) {
    if (!open) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onclose();
      return;
    }

    if (filteredTemplates.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      activeIndex = (activeIndex + 1) % filteredTemplates.length;
      tick().then(() => scrollActiveTemplateIntoView());
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      activeIndex = (activeIndex - 1 + filteredTemplates.length) % filteredTemplates.length;
      tick().then(() => scrollActiveTemplateIntoView());
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      onselect((filteredTemplates[activeIndex] ?? filteredTemplates[0]).template);
    }
  }

  function scrollActiveTemplateIntoView() {
    const itemElements = resultListElement?.querySelectorAll?.('[data-add-node-menu-item="true"]');
    const activeItemElement = itemElements?.[activeIndex];

    // FIXME

    if (!resultListElement || !activeItemElement) {
      return;
    }
  }

  function isActiveTemplate(flatIndex) {
    return activeIndex === flatIndex;
  }

  function setActiveTemplate(flatIndex) {
    if (flatIndex >= 0 && flatIndex < filteredTemplates.length) {
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

    <div
      bind:this={resultListElement}
      class="relative mt-2 flex max-h-[calc(70vh-3.5rem)] flex-col gap-2 overflow-auto pr-0.5"
      role="listbox"
    >
      {#if Object.keys(filteredTemplatesByCategory).length === 0}
        <div class="text-xs text-vsc-muted">No matching node types</div>
      {:else}
        {#each Object.entries(filteredTemplatesByCategory) as [category, templates] (category)}
          <div class="flex flex-col gap-1.5">
            <div
              class="flex items-center gap-2 px-1 text-[0.65rem] font-semibold uppercase tracking-widest text-vsc-muted"
            >
              <span>{category}</span>
              <span class="flex-1 h-px bg-vsc-editor-widget-border"></span>
            </div>
            {#each templates as item (item.template.templateId)}
              <button
                data-add-node-menu-item="true"
                class="group flex w-full cursor-pointer items-center gap-2 rounded-lg border border-vsc-editor-widget-border bg-vsc-button-secondary-bg text-left text-vsc-button-secondary-fg transition-[border-color,background-color,color] overflow-clip"
                class:border-vsc-focus={isActiveTemplate(item.flatIndex)}
                class:bg-vsc-list-active-bg={isActiveTemplate(item.flatIndex)}
                class:text-vsc-list-active-fg={isActiveTemplate(item.flatIndex)}
                data-active={isActiveTemplate(item.flatIndex)}
                aria-selected={isActiveTemplate(item.flatIndex)}
                role="option"
                type="button"
                onmouseenter={() => setActiveTemplate(item.flatIndex)}
                onclick={() => onselect(item.template)}
              >
                <span
                  aria-hidden="true"
                  class="relative h-8 w-2.5"
                  style="background-color: {readColorForCss(item.template.nodeColor)};"
                ></span>

                <span class="flex-1 min-w-0">
                  <span class="block text-xs font-semibold truncate"
                    >{item.template.defaultTitle}</span
                  >
                </span>
              </button>
            {/each}
          </div>
        {/each}
      {/if}
    </div>
  </div>
{/if}
