<script lang="ts">
  import { type NodeTemplate } from "@shared/node-editor/workspaceTypes";
  import { type XYPosition } from "@xyflow/svelte";
  import { marked } from "marked";
  import { readColorForCss } from "src/node-editor/utils/colors";
  import { GENERIC_TEMPLATES } from "src/node-editor/utils/nodeFactory.svelte";
  import { workspace } from "src/workspace.svelte";
  import { onMount } from "svelte";
  import { innerHeight, innerWidth } from "svelte/reactivity/window";

  export type AddMenuProps = {
    screenPosition: XYPosition;
    // Variant Kind ID or Template ID. Implies there is a source connection to attach new node to as the child.
    connectionFilter: string | undefined;
    oncancel?: () => void;
    onselection?: (template: NodeTemplate) => void;
  };

  const { screenPosition, connectionFilter, oncancel, onselection }: AddMenuProps = $props();

  let containerElement = $state<HTMLDivElement>();
  const DESCRIPTION_PANEL_WIDTH_PX = 248;
  const VIEWPORT_PADDING_PX = 0;
  const MENU_CURSOR_OFFSET_PX = 8;
  const MIN_CONTAINER_HEIGHT_PX = 280;

  let searchQuery = $state("");
  let activeIndex = $state(0);
  let searchInput: HTMLInputElement | undefined = $state();
  let resultListElement: HTMLElement | undefined = $state();
  let containerHeight = $derived.by(() => {
    const spaceBelowCursor = innerHeight.current - screenPosition.y - VIEWPORT_PADDING_PX;
    return Math.min(Math.max(MIN_CONTAINER_HEIGHT_PX, spaceBelowCursor));
  });
  let containerWidth = $derived(containerElement?.getBoundingClientRect().width ?? 0);
  let top = $derived(
    Math.max(
      VIEWPORT_PADDING_PX,
      Math.min(
        screenPosition.y + MENU_CURSOR_OFFSET_PX,
        innerHeight.current - containerHeight - VIEWPORT_PADDING_PX,
      ),
    ),
  );
  let left = $derived(
    Math.max(
      VIEWPORT_PADDING_PX,
      Math.min(
        screenPosition.x + MENU_CURSOR_OFFSET_PX,
        innerWidth.current - containerWidth - VIEWPORT_PADDING_PX,
      ),
    ),
  );
  let isRootNodeMissing = $derived(workspace.getRootNode() === undefined);

  let availableTemplates = $derived.by(() => {
    if (isRootNodeMissing) {
      return workspace.getValidTemplates(workspace.context.rootTemplateOrVariantId);
    }
    if (connectionFilter !== undefined) {
      return [
        ...workspace.getValidTemplates(connectionFilter),
        ...GENERIC_TEMPLATES.filter(template => template.inputPins.length > 0), // only allow templates that can connect
      ];
    } else {
      return [...GENERIC_TEMPLATES, ...Object.values(workspace.context.nodeTemplatesById)];
    }
  });

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
  let activeTemplateDescription = $derived(activeTemplate?.description);
  let activeTemplateDescriptionHtml: string | undefined = $derived(
    activeTemplateDescription
      ? (marked.parse(activeTemplateDescription, {
          breaks: true,
          gfm: true,
        }) as string)
      : undefined,
  );

  let showDescriptionOnLeft = $derived(
    left + containerWidth + DESCRIPTION_PANEL_WIDTH_PX + VIEWPORT_PADDING_PX > innerWidth.current,
  );

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
  data-add-menu
  class="absolute overflow-visible z-3001"
  style:left={`${left}px`}
  style:top={`${top}px`}
>
  <div
    bind:this={containerElement}
    role="dialog"
    aria-label="Add node menu"
    tabindex="-1"
    class="flex w-64 flex-col overflow-hidden rounded-lg border border-vsc-editor-widget-border bg-vsc-editor-widget-bg p-2.5 text-vsc-editor-fg shadow-2xl"
    style:height={`${containerHeight}px`}
    onkeydown={handleKeyDown}
  >
    <input
      bind:this={searchInput}
      class="w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
      type="search"
      bind:value={searchQuery}
      onkeydown={handleKeyDown}
      placeholder={isRootNodeMissing ? "choose a root node" : "Search nodes..."}
    />

    <div
      bind:this={resultListElement}
      class="relative mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-scroll pr-0.5"
      role="listbox"
    >
      {#if searchedTemplatesByCategory.size === 0}
        <div class="text-xs text-vsc-muted">
          {isRootNodeMissing ? "No matching root node types" : "No matching node types"}
        </div>
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
                class="group flex w-full cursor-pointer items-center gap-2 rounded-lg border border-vsc-editor-widget-border bg-vsc-button-secondary-bg text-left text-vsc-button-secondary-fg transition-[border-color,background-color,color] overflow-clip scroll-m-8"
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

  {#if activeTemplateDescriptionHtml}
    <div
      class="pointer-events-auto absolute top-0 w-62 rounded-lg border border-vsc-editor-widget-border bg-vsc-editor-widget-bg px-3 py-2.5 text-vsc-editor-fg shadow-2xl"
      class:left-[calc(100%+0.5rem)]={!showDescriptionOnLeft}
      class:right-[calc(100%+0.5rem)]={showDescriptionOnLeft}
    >
      <div class="text-[0.65rem] font-semibold uppercase tracking-widest text-vsc-muted">
        {activeTemplate.defaultTitle}
      </div>
      <div class="description-markdown mt-1.5 text-xs leading-4 text-vsc-input-fg">
        {@html activeTemplateDescriptionHtml}
      </div>
    </div>
  {/if}
</div>

<!-- style injection for the markdown preview -->
<style>
  .description-markdown :global(p + p) {
    margin-top: 0.5rem;
  }

  .description-markdown :global(ul) {
    margin-top: 0.375rem;
    list-style-type: disc;
    padding-left: 1rem;
  }

  .description-markdown :global(ol) {
    margin-top: 0.375rem;
    list-style-type: decimal;
    padding-left: 1rem;
  }

  .description-markdown :global(li + li) {
    margin-top: 0.125rem;
  }

  .description-markdown :global(code) {
    border: 1px solid var(--vscode-input-border);
    border-radius: 0.25rem;
    background: var(--vscode-input-background);
    padding: 0 0.25rem;
    font-size: 0.7rem;
  }

  .description-markdown :global(a) {
    color: var(--vscode-textLink-foreground);
    text-decoration: underline;
    text-decoration-thickness: from-font;
  }

  .description-markdown :global(a:hover) {
    color: var(--vscode-textLink-activeForeground);
  }
</style>
