<script lang="ts">
  import { createTooltip } from "@webview-shared/components/tooltip/createTooltip.svelte";
  import TooltipContent from "@webview-shared/components/tooltip/TooltipContent.svelte";
  import { ChevronDown, ChevronRight, CircleX, Info, TriangleAlert } from "lucide-svelte";
  import type { Snippet } from "svelte";
  import type { NpcEditorIssue } from "../issues";
  import type { NpcPropertyInfoItem } from "../propertyModel";

  let {
    title,
    typeLabel,
    description,
    infoItems = [],
    issues = [],
    inline = true,
    summary,
    handle,
    actions,
    titleContent,
    tooltipContent,
    onunset,
    vscodeContext,
    onContextMenu,
    onInfoClick,
    interactiveInfoTooltip = false,
    infoTooltipPinned = false,
    hideInfoButton = false,
    collapsed = $bindable(false),
    children,
  }: {
    title: string;
    typeLabel?: string;
    description?: string;
    infoItems?: NpcPropertyInfoItem[];
    issues?: NpcEditorIssue[];
    inline?: boolean;
    summary?: string;
    handle?: Snippet;
    actions?: Snippet;
    titleContent?: Snippet;
    tooltipContent?: Snippet;
    onunset?: () => void;
    vscodeContext?: string;
    onContextMenu?: (event: MouseEvent) => void;
    onInfoClick?: () => void;
    interactiveInfoTooltip?: boolean;
    infoTooltipPinned?: boolean;
    hideInfoButton?: boolean;
    collapsed?: boolean;
    children: Snippet;
  } = $props();

  const hasTooltipContent = $derived(
    Boolean(tooltipContent) || Boolean(description) || infoItems.length > 0,
  );
  const infoTooltip = createTooltip({ interactive: true });
  const hasIssues = $derived(issues.length > 0);
  const hasErrorIssues = $derived(issues.some(issue => issue.severity === "error"));
  const issueTooltip = createTooltip();

  $effect(() => {
    if (infoTooltipPinned) {
      infoTooltip.pin();
    } else {
      infoTooltip.unpin();
    }
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

{#snippet renderTooltipContent()}
  {#if tooltipContent}
    {@render tooltipContent()}
  {:else}
    <div class="space-y-2">
      <div class="space-y-1">
        <div class="font-semibold">
          {title}{#if typeLabel}&nbsp;({typeLabel}){/if}
        </div>
        {#if description}
          <div class="whitespace-pre-line">{description}</div>
        {/if}
      </div>

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
  {/if}
{/snippet}

{#snippet issueTooltipContent()}
  <div class="space-y-1">
    <div class="font-semibold">{issues.length === 1 ? "Issue" : "Issues"}</div>
    <ul class="pl-0 list-none">
      {#each issues as issue (`${issue.code}-${issue.message}`)}
        <li>- {issue.message}</li>
      {/each}
    </ul>
  </div>
{/snippet}

{#if inline}
  <section
    class="border rounded-md border-vsc-border bg-vsc-panel"
    data-vscode-context={vscodeContext}
    role="presentation"
    oncontextmenu={onContextMenu}
  >
    <div class="flex items-center gap-1 px-4 py-2 group/inline-field min-h-12">
      <div class="relative flex items-center justify-between w-56 min-w-0 gap-1 shrink-0">
        <div class="flex items-center min-w-0 gap-1">
          {#if handle}
            {@render handle()}
          {/if}

          <div class="flex items-center min-w-0 gap-1 truncate">
            {#if titleContent}
              <div class="relative max-w-full min-w-0" role="presentation">
                {@render titleContent()}
              </div>
            {:else}
              <h2 class="relative text-sm font-semibold truncate">{title}</h2>
            {/if}

            {#if hasTooltipContent && !hideInfoButton}
              <button
                {@attach infoTooltip.trigger}
                class="relative inline-flex items-center justify-center rounded-sm size-4 opacity-70"
                aria-label={`Info about ${title}`}
                tabindex={-1}
                onclick={event => {
                  event.stopPropagation();
                  infoTooltip.open();
                  onInfoClick?.();
                }}
              >
                <Info size={12} />
              </button>
            {/if}

            {#if hasIssues}
              <button
                {@attach issueTooltip.trigger}
                class="relative inline-flex items-center justify-center rounded-sm size-4 opacity-80"
                aria-label={`Issues for ${title}`}
                tabindex={-1}
                onclick={event => event.stopPropagation()}
                style:color={hasErrorIssues
                  ? "var(--vscode-errorForeground)"
                  : "var(--vscode-editorWarning-foreground, var(--vscode-list-warningForeground, var(--vscode-errorForeground)))"}
              >
                <TriangleAlert size={14} strokeWidth={2.5} />
              </button>
            {/if}
            {#if summary}
              <div class="text-xs truncate text-vsc-muted">{summary}</div>
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

      <div class="flex-1 min-w-0">
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
    class="border rounded-md border-vsc-border bg-vsc-panel"
    data-vscode-context={vscodeContext}
    role="presentation"
    oncontextmenu={onContextMenu}
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
      <div class="relative flex items-center flex-1 min-w-0 gap-1">
        <span class="inline-flex items-center w-4 h-4 opacity-75">
          {#if collapsed}
            <ChevronRight size={16} />
          {:else}
            <ChevronDown size={16} />
          {/if}
        </span>

        {#if titleContent}
          <div
            class="relative max-w-full min-w-0"
            role="presentation"
            onkeydown={stopHeaderKeydown}
            onclick={stopHeaderInteraction}
          >
            {@render titleContent()}
          </div>
        {:else}
          <h2 class="relative text-sm font-semibold truncate">{title}</h2>
        {/if}

        {#if hasIssues}
          <button
            {@attach issueTooltip.trigger}
            class="relative inline-flex items-center justify-center rounded-sm size-4 opacity-80"
            aria-label={`Issues for ${title}`}
            tabindex={-1}
            onclick={event => event.stopPropagation()}
            style:color={hasErrorIssues
              ? "var(--vscode-errorForeground)"
              : "var(--vscode-editorWarning-foreground, var(--vscode-list-warningForeground, var(--vscode-errorForeground)))"}
          >
            <TriangleAlert size={12} />
          </button>
        {/if}

        {#if hasTooltipContent && !hideInfoButton}
          <button
            {@attach infoTooltip.trigger}
            class="relative inline-flex items-center justify-center rounded-sm size-4 opacity-70"
            aria-label={`Info about ${title}`}
            tabindex={-1}
            onclick={event => {
              event.stopPropagation();
              infoTooltip.open();
              onInfoClick?.();
            }}
          >
            <Info size={12} />
          </button>
        {/if}
      </div>

      {#if summary || actions}
        <div class="relative z-10 flex items-center justify-end min-w-0 gap-3 shrink-0">
          {#if summary}
            <div class="text-xs truncate text-vsc-muted">{summary}</div>
          {/if}
          {#if actions}
            {@render actions()}
          {/if}
        </div>
      {/if}
    </div>

    {#if !collapsed}
      <div class="p-3 space-y-3">
        {@render children()}
      </div>
    {/if}
  </section>
{/if}

{#if hasIssues}
  <TooltipContent
    tooltip={issueTooltip}
    placement="right"
    class="z-50 max-w-lg p-2 text-xs text-left border rounded-md shadow-lg border-vsc-tooltip-border bg-vsc-tooltip-bg text-vsc-tooltip-fg"
  >
    {@render issueTooltipContent()}
  </TooltipContent>
{/if}

{#if hasTooltipContent && !hideInfoButton}
  <TooltipContent
    tooltip={infoTooltip}
    placement="right"
    class="z-50 max-w-lg p-2 text-xs text-left border rounded-md shadow-lg border-vsc-tooltip-border bg-vsc-tooltip-bg text-vsc-tooltip-fg"
  >
    {@render renderTooltipContent()}
  </TooltipContent>
{/if}
