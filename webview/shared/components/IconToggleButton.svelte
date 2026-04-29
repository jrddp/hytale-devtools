<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    enabled = false,
    active = false,
    activeLabel,
    inactiveLabel,
    ontoggle,
    children,
  }: {
    enabled?: boolean;
    active?: boolean;
    activeLabel: string;
    inactiveLabel: string;
    ontoggle?: () => void;
    children: Snippet;
  } = $props();
</script>

<button
  type="button"
  class="relative inline-flex size-4 items-center justify-center rounded-sm transition-colors"
  aria-label={active ? activeLabel : inactiveLabel}
  title={active ? activeLabel : inactiveLabel}
  tabindex={-1}
  disabled={!enabled}
  class:opacity-50={!enabled}
  class:opacity-80={enabled && !active}
  style:color={active
    ? "var(--vscode-focusBorder)"
    : "var(--vscode-descriptionForeground, var(--vscode-input-foreground))"}
  style:background-color={active
    ? "color-mix(in srgb, var(--vscode-focusBorder) 18%, transparent)"
    : "transparent"}
  onclick={event => {
    event.stopPropagation();
    ontoggle?.();
  }}
>
  {@render children()}
</button>
