<script lang="ts">
  import { createTooltip } from "@webview-shared/components/tooltip/createTooltip.svelte";
  import TooltipContent from "@webview-shared/components/tooltip/TooltipContent.svelte";
  import { ChevronDown, ChevronRight, CircleX, Info } from "lucide-svelte";
  import type { Snippet } from "svelte";
  import type { NpcPropertyInfoItem } from "../propertyModel";

  let {
    title,
    description,
    infoItems = [],
    inline = true,
    summary,
    handle,
    actions,
    titleContent,
    onunset,
    vscodeContext,
    hideInfoButton = false,
    collapsed = $bindable(false),
    children,
  }: {
    title: string;
    description?: string;
    infoItems?: NpcPropertyInfoItem[];
    inline?: boolean;
    summary?: string;
    handle?: Snippet;
    actions?: Snippet;
    titleContent?: Snippet;
    onunset?: () => void;
    vscodeContext?: string;
    hideInfoButton?: boolean;
    collapsed?: boolean;
    children: Snippet;
  } = $props();

  const hasTooltipContent = $derived(Boolean(description) || infoItems.length > 0);
  const infoTooltip = createTooltip();

  function stopHeaderInteraction(event: Event) {
    event.stopPropagation();
  }

  function stopHeaderKeydown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    event.stopPropagation();
  }
</script>

{#snippet tooltipContent()}
  <div class="space-y-2">
    {#if description}
      <div class="space-y-1">
        <div class="font-semibold">{title}</div>
        <div class="whitespace-pre-line">{description}</div>
      </div>
    {/if}

    {#if infoItems.length > 0}
      <dl class="space-y-1">
        {#each infoItems as item (`${item.label}-${item.value}`)}
          <div class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
            <dt class="text-vsc-muted">{item.label}</dt>
            <dd class="break-words">{item.value}</dd>
          </div>
        {/each}
      </dl>
    {/if}
  </div>
{/snippet}

{#if inline}
  <section
    class="rounded-md border border-vsc-border bg-vsc-panel"
    data-vscode-context={vscodeContext}
  >
    <div class="group/inline-field flex min-h-12 items-center gap-1 px-4 py-2">
      <div class="relative flex w-56 min-w-0 shrink-0 items-center justify-between gap-1">
        <div class="flex min-w-0 items-center gap-1">
          {#if handle}
            {@render handle()}
          {/if}

          <div class="flex min-w-0 items-center gap-1 truncate">
            {#if titleContent}
              <div class="relative min-w-0 max-w-full" role="presentation">
                {@render titleContent()}
              </div>
            {:else}
              <h2 class="relative truncate text-sm font-semibold">{title}</h2>
            {/if}

            {#if hasTooltipContent && !hideInfoButton}
              <button
                {@attach infoTooltip.trigger}
                class="relative inline-flex size-4 items-center justify-center rounded-sm opacity-70"
                aria-label={`Info about ${title}`}
                tabindex={-1}
                onclick={event => event.stopPropagation()}
              >
                <Info size={12} />
              </button>
            {/if}

            {#if summary}
              <div class="truncate text-xs text-vsc-muted">{summary}</div>
            {/if}
          </div>
        </div>

        {#if onunset}
          <button
            type="button"
            class="pointer-events-none inline-flex size-0 shrink-0 items-center justify-center rounded-md text-vsc-muted opacity-0 transition-[opacity,color] group-hover/inline-field:size-6 group-hover/inline-field:pointer-events-auto group-hover/inline-field:opacity-100 group-focus-within/inline-field:pointer-events-auto group-focus-within/inline-field:opacity-100 hover:text-vsc-input-fg focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
            aria-label={`Delete ${title}`}
            onclick={event => {
              event.stopPropagation();
              onunset();
            }}
          >
            <CircleX size={14} />
          </button>
        {/if}
      </div>

      <div class="min-w-0 flex-1">
        {@render children()}
      </div>

      {#if actions}
        <div class="relative flex items-center gap-2">
          {@render actions()}
        </div>
      {/if}
    </div>
  </section>
{:else}
  <section
    class="rounded-md border border-vsc-border bg-vsc-panel"
    data-vscode-context={vscodeContext}
  >
    <div
      class="group/collapsible-field relative flex min-h-11 w-full items-center gap-3 rounded-t-md border-vsc-border px-3 py-2.5 transition-[background-color,box-shadow]"
      class:border-b={!collapsed}
      class:rounded-b-md={collapsed}
      class:cursor-pointer={true}
      aria-expanded={!collapsed}
      role="button"
      tabindex={0}
      onclick={event => {
        collapsed = !collapsed;
        event.preventDefault();
      }}
      onkeydown={event => {
        if (event.key === "Enter" || event.key === " ") {
          collapsed = !collapsed;
          event.preventDefault();
        }
      }}
    >
      <div class="relative flex min-w-0 flex-1 items-center gap-1">
        <span class="inline-flex h-4 w-4 items-center opacity-75">
          {#if collapsed}
            <ChevronRight size={16} />
          {:else}
            <ChevronDown size={16} />
          {/if}
        </span>

        {#if titleContent}
          <div
            class="relative min-w-0 max-w-full"
            role="presentation"
            onkeydown={stopHeaderKeydown}
            onclick={stopHeaderInteraction}
          >
            {@render titleContent()}
          </div>
        {:else}
          <h2 class="relative truncate text-sm font-semibold">{title}</h2>
        {/if}

        {#if hasTooltipContent && !hideInfoButton}
          <button
            {@attach infoTooltip.trigger}
            class="relative inline-flex size-4 items-center justify-center rounded-sm opacity-70"
            aria-label={`Info about ${title}`}
            tabindex={-1}
            onclick={event => event.stopPropagation()}
          >
            <Info size={12} />
          </button>
        {/if}
      </div>

      {#if summary || actions}
        <div class="relative z-10 flex min-w-0 shrink-0 items-center justify-end gap-3">
          {#if summary}
            <div class="truncate text-xs text-vsc-muted">{summary}</div>
          {/if}
          {#if actions}
            {@render actions()}
          {/if}
        </div>
      {/if}
    </div>

    {#if !collapsed}
      <div class="space-y-3 p-3">
        {@render children()}
      </div>
    {/if}
  </section>
{/if}

{#if hasTooltipContent && !hideInfoButton}
  <TooltipContent
    tooltip={infoTooltip}
    placement="right"
    class="z-50 max-w-lg rounded-md border border-vsc-tooltip-border bg-vsc-tooltip-bg p-2 text-xs text-left text-vsc-tooltip-fg shadow-lg"
  >
    {@render tooltipContent()}
  </TooltipContent>
{/if}
