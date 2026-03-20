<script lang="ts">
  import { createTooltip } from "@webview-shared/components/tooltip/createTooltip.svelte";
  import TooltipContent from "@webview-shared/components/tooltip/TooltipContent.svelte";
  import type { Snippet } from "svelte";

  let {
    readOnly = false,
    readOnlyMessage,
    blockPointerDown = false,
    class: className = "",
    children,
  }: {
    readOnly?: boolean;
    readOnlyMessage?: string;
    blockPointerDown?: boolean;
    class?: string;
    children: Snippet;
  } = $props();

  const tooltip = createTooltip({ followCursor: true });

  function preventReadOnlyInteraction(event: MouseEvent | PointerEvent) {
    if (!readOnly || !blockPointerDown) {
      return;
    }

    event.preventDefault();
  }
</script>

{#if readOnly && readOnlyMessage}
  <div
    {@attach tooltip.trigger}
    class={className}
    role="presentation"
    onpointerdown={preventReadOnlyInteraction}
    onmousedown={preventReadOnlyInteraction}
  >
    {@render children()}
  </div>

  <TooltipContent
    tooltip={tooltip}
    placement="right-start"
    class="z-50 max-w-lg p-2 text-xs text-left border rounded-md shadow-lg border-vsc-border bg-vsc-tooltip-bg text-vsc-tooltip-fg"
  >
    <div class="whitespace-pre-line">{readOnlyMessage}</div>
  </TooltipContent>
{:else}
  <div
    class={className}
    role="presentation"
    onpointerdown={preventReadOnlyInteraction}
    onmousedown={preventReadOnlyInteraction}
  >
    {@render children()}
  </div>
{/if}
