<script lang="ts">
  import type { Field } from "@shared/fieldTypes";
  import { ChevronDown, ChevronRight, Info } from "lucide-svelte";
  import { marked } from "marked";
  import { workspace } from "src/workspace.svelte";
  import type { Snippet } from "svelte";
  import { createTooltip } from "../../../shared/components/tooltip/createTooltip.svelte";
  import TooltipContent from "../../../shared/components/tooltip/TooltipContent.svelte";
  import { createStickyHeader } from "./createStickyHeader.svelte";
  import { getFieldLabel, humanize } from "./fieldHelpers";

  const STICKY_HEADER_HEIGHT_PX = 44;

  interface Props {
    field: Field;
    depth?: number;
    summary?: string;
    inline?: boolean;
    collapsedByDefault?: boolean;
    collapsed?: boolean;
    collapseEnabled?: boolean;
    onCollapsedChange?: (collapsed: boolean) => void;
    actions?: Snippet;
    children?: Snippet;
  }

  let {
    field,
    depth = 0,
    inline = false,
    summary,
    collapsedByDefault = true,
    collapseEnabled = true,
    onCollapsedChange,
    actions,
    children,
    collapsed = $bindable(collapsedByDefault),
  }: Props = $props();

  const infoTooltip = createTooltip();
  const stickyHeader = createStickyHeader({
    enabled: () => !inline && !collapsed,
    top: () => depth * STICKY_HEADER_HEIGHT_PX,
  });

  const label = $derived(getFieldLabel(field));
  const descriptionHtml = $derived(
    field.markdownDescription ? marked(field.markdownDescription) : undefined,
  );
  const stickyTop = $derived(depth * STICKY_HEADER_HEIGHT_PX);
  const isStickyEnabled = $derived(!inline && !collapsed);

  function setPanelCollapsed(nextCollapsed: boolean) {
    if (onCollapsedChange) {
      onCollapsedChange(nextCollapsed);
      return;
    }

    collapsed = nextCollapsed;
  }

  function toggleCollapsed() {
    if (!collapseEnabled) return;

    setPanelCollapsed(!collapsed);
  }

  $effect(() => {
    const commandVersion = workspace.collapseAllVersion;
    const nextCollapsed = workspace.collapseAllTarget;

    if (inline || commandVersion === 0 || nextCollapsed === null) return;

    setPanelCollapsed(nextCollapsed);
  });
</script>

<!-- # Title -->
{#snippet title()}
  <h2 class="relative text-sm font-semibold truncate pointer-events-none">
    {label}
  </h2>
  <button
    {@attach infoTooltip.trigger}
    type="button"
    class="relative inline-flex items-center justify-center w-4 h-4 rounded-sm group/info opacity-70"
    aria-label={`Info about ${label}`}
  >
    <Info size={12} />
    <TooltipContent
      tooltip={infoTooltip}
      placement="right"
      class="z-50 max-w-lg p-2 text-xs text-left border rounded-md shadow-lg border-vsc-border bg-vsc-tooltip-bg text-vsc-tooltip-fg"
    >
      <div class="space-y-1">
        <div class="font-semibold">{field.schemaKey} ({humanize(field.type)})</div>
        {@html descriptionHtml}
      </div>
    </TooltipContent>
  </button>
  {#if summary}
    <div class="text-xs truncate text-vsc-muted">{summary}</div>
  {/if}
{/snippet}

<section
  class="border rounded-md border-vsc-border bg-vsc-panel"
  data-depth={depth}
  data-field-panel
>
  {#if inline}
    <div class="flex items-center gap-4 px-4 py-2 min-h-12">
      <div class="relative flex items-center w-56 min-w-0 gap-1 shrink-0">
        {@render title()}
      </div>

      {#if children}
        <div class="flex-1 min-w-0">
          {@render children()}
        </div>
      {/if}

      {#if actions}
        <div class="relative flex items-center gap-2">
          {@render actions()}
        </div>
      {/if}
    </div>
  {:else}
    <!-- ## Collapsable Title Bar -->
    <button
      {@attach stickyHeader.header}
      class="relative flex items-center w-full min-h-11 gap-3 px-3 py-2.5 border-vsc-border transition-[background-color,box-shadow] rounded-t-md"
      class:border-b={!collapsed}
      class:sticky={isStickyEnabled}
      class:bg-vsc-panel={!stickyHeader.isStuck()}
      class:bg-vsc-editor-widget-bg={stickyHeader.isStuck()}
      class:shadow-sm={stickyHeader.isStuck()}
      aria-expanded={!collapsed}
      data-stuck={stickyHeader.isStuck()}
      style:top={isStickyEnabled ? `${stickyTop}px` : undefined}
      style:z-index={isStickyEnabled && stickyHeader.isStuck() ? `${120 - depth}` : undefined}
      onclick={toggleCollapsed}
    >
      <div class="relative flex items-center flex-1 min-w-0 gap-1">
        <span class="inline-flex items-center w-4 h-4 opacity-75 pointer-events-none">
          {#if collapsed}
            <ChevronRight size={16} />
          {:else}
            <ChevronDown size={16} />
          {/if}
        </span>

        {@render title()}
      </div>

      {#if actions}
        <div class="relative z-10 flex items-center justify-center gap-2">
          {@render actions()}
        </div>
      {/if}
    </button>

    {#if !collapsed && children}
      <div class="p-3 space-y-3">
        {@render children()}
      </div>
    {/if}
  {/if}
</section>
