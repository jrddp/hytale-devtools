<script lang="ts">
  import { SquareFunction } from "lucide-svelte";

  let {
    enabled = false,
    active = false,
    ontoggle,
  }: {
    enabled?: boolean;
    active?: boolean;
    ontoggle?: () => void;
  } = $props();
</script>

<button
  type="button"
  class="relative inline-flex size-4 items-center justify-center rounded-sm transition-colors"
  aria-label={active ? "Switch to literal mode" : "Switch to compute mode"}
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
  <SquareFunction size={12} />
</button>
