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
  class="relative inline-flex items-center justify-center rounded-sm size-4 opacity-80"
  aria-label={active ? "Switch to literal mode" : "Switch to compute mode"}
  tabindex={-1}
  disabled={!enabled}
  style:color={active ? "var(--vscode-focusBorder)" : undefined}
  onclick={event => {
    event.stopPropagation();
    ontoggle?.();
  }}
>
  <SquareFunction size={12} />
</button>
