<script lang="ts">
  import { ChevronDown, ChevronRight, CircleX, Info } from "lucide-svelte";
  import { marked } from "marked";
  import type { RenderFieldProps } from "src/common";
  import { workspace } from "src/workspace.svelte";
  import { createTooltip } from "../../../shared/components/tooltip/createTooltip.svelte";
  import TooltipContent from "../../../shared/components/tooltip/TooltipContent.svelte";
  import { createStickyHeader } from "./createStickyHeader.svelte";
  import { getFieldLabel, humanize } from "./fieldHelpers";

  const STICKY_HEADER_HEIGHT_PX = 44;

  let {
    field,
    depth = 0,
    readOnly = false,
    fieldPanelOverrides,
    inline = false,
    onunset,
    collapsedByDefault = true,
    collapseEnabled = true,
    collapsed = $bindable(collapsedByDefault),
    summary,
    childReadOnly = false,
    actions,
    glyphs,
    children,
  }: RenderFieldProps & {
    inline?: boolean;
    collapsedByDefault?: boolean;
    collapseEnabled?: boolean;
    collapsed?: boolean;
    childReadOnly?: boolean;
  } = $props();

  const infoTooltip = createTooltip();
  const stickyHeader = createStickyHeader({
    enabled: () => !inline && !collapsed,
    top: () => depth * STICKY_HEADER_HEIGHT_PX,
  });

  const isMinimal = $derived(fieldPanelOverrides?.minimal === true);
  const titleOverride = $derived(fieldPanelOverrides?.title);
  const label = $derived(getFieldLabel(field));
  const descriptionHtml = $derived(
    field.markdownDescription ? marked(field.markdownDescription) : undefined,
  );
  const stickyTop = $derived(depth * STICKY_HEADER_HEIGHT_PX);
  const isStickyEnabled = $derived(!inline && !collapsed);

  // respond to workspace-level collapse all command
  $effect(() => {
    const commandVersion = workspace.collapseAllVersion;
    const nextCollapsed = workspace.collapseAllTarget;

    if (inline || commandVersion === 0 || nextCollapsed === null) return;
    collapsed = nextCollapsed;
  });

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

<!-- # Title -->
{#snippet title()}
  {#if titleOverride}
    <div
      class="relative min-w-0 max-w-full"
      role="presentation"
      onkeydown={stopHeaderKeydown}
      onclick={stopHeaderInteraction}
    >
      {@render titleOverride()}
    </div>
  {:else}
    <h2 class="relative text-sm font-semibold truncate pointer-events-none">
      {label}
    </h2>
  {/if}
  <button
    {@attach infoTooltip.trigger}
    class="relative inline-flex items-center justify-center size-4 rounded-sm opacity-70"
    aria-label={`Info about ${label}`}
    tabindex={-1}
    onclick={event => event.stopPropagation()}
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
        <div>Can inherit? {field.inheritsValue}</div>
      </div>
    </TooltipContent>
  </button>

  {@render glyphs?.()}

  {#if summary}
    <div class="text-xs truncate text-vsc-muted">{summary}</div>
  {/if}
{/snippet}

{#if isMinimal}
  {@render children?.()}
{:else}
  <section
    class="border rounded-md border-vsc-border"
    class:bg-vsc-panel={!readOnly}
    class:bg-vsc-panel-readonly={readOnly}
    data-depth={depth}
    data-field-panel
  >
    {#if inline}
      <div class="flex items-center gap-1 px-4 py-2 group/inline-field min-h-12">
        <div class="relative flex items-center justify-between w-56 min-w-0 gap-1 shrink-0">
          <div class="flex items-center gap-1 min-w-0">
            {@render title()}
          </div>
          {#if onunset && !readOnly}
            <button
              type="button"
              class="pointer-events-none inline-flex size-0 shrink-0 items-center justify-center rounded-md text-vsc-muted opacity-0 transition-[opacity,color] group-hover/inline-field:size-6 group-hover/inline-field:pointer-events-auto group-hover/inline-field:opacity-100 group-focus-within/inline-field:pointer-events-auto group-focus-within/inline-field:opacity-100 hover:text-vsc-input-fg focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
              aria-label={`Unset ${label}`}
              onclick={onunset}
            >
              <CircleX size={14} />
            </button>
          {/if}
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
      <div
        {@attach stickyHeader.header}
        class="relative flex items-center w-full min-h-11 gap-3 px-3 py-2.5 border-vsc-border transition-[background-color,box-shadow] rounded-t-md"
        class:border-b={!collapsed}
        class:rounded-b-md={collapsed}
        class:sticky={isStickyEnabled}
        class:bg-vsc-panel={!stickyHeader.isStuck() && !readOnly}
        class:bg-vsc-panel-readonly={!stickyHeader.isStuck() && readOnly}
        class:bg-vsc-editor-widget-bg={stickyHeader.isStuck()}
        class:shadow-sm={stickyHeader.isStuck()}
        class:cursor-pointer={collapseEnabled}
        aria-expanded={!collapsed}
        data-stuck={stickyHeader.isStuck()}
        role="button"
        tabindex={collapseEnabled ? 0 : -1}
        style:top={isStickyEnabled ? `${stickyTop}px` : undefined}
        style:z-index={isStickyEnabled && stickyHeader.hasPassedStickyThreshold() ? `${120 - depth}` : undefined}
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
        <div class="relative flex items-center flex-1 min-w-0 gap-1">
          <span class="inline-flex items-center w-4 h-4 opacity-75">
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
      </div>

      {#if !collapsed && children}
        <div class="p-3 space-y-3" class:bg-vsc-panel-readonly={readOnly || childReadOnly}>
          {@render children()}
        </div>
      {/if}
    {/if}
  </section>
{/if}
