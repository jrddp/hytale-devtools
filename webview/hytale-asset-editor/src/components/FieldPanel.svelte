<script lang="ts">
  import type { Field } from "@shared/fieldTypes";
  import { ChevronDown, ChevronRight, Info } from "lucide-svelte";
  import { marked } from "marked";
  import type { Snippet } from "svelte";
  import { workspace } from "src/workspace.svelte";
  import { createTooltip } from "../../../shared/components/tooltip/createTooltip.svelte";
  import TooltipContent from "../../../shared/components/tooltip/TooltipContent.svelte";
  import { getFieldLabel, humanize } from "./fieldHelpers";

  interface Props {
    field: Field;
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

  const label = $derived(getFieldLabel(field));
  const descriptionHtml = $derived(
    field.markdownDescription ? marked(field.markdownDescription) : undefined,
  );

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
        <div class="font-semibold">{humanize(field.type)}</div>
        {@html descriptionHtml}
      </div>
    </TooltipContent>
  </button>
  {#if summary}
    <div class="text-xs text-vsc-muted">{summary}</div>
  {/if}
{/snippet}

<section class="border rounded-md border-vsc-border bg-vsc-panel">
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
      class="relative flex items-center gap-3 border-vsc-border px-3 py-2.5 w-full"
      class:border-b={!collapsed}
      aria-expanded={!collapsed}
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
