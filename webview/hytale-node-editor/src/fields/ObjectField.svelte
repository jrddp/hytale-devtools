<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    inputId,
    label,
    hasNestedFields = true,
    children,
  }: {
    inputId: string;
    label: string;
    hasNestedFields?: boolean;
    children?: Snippet;
  } = $props();
</script>

<div
  id={inputId}
  class="flex flex-col gap-1.5 rounded-md border border-dashed border-vsc-editor-widget-border p-2"
>
  <div class="text-xs font-bold uppercase text-vsc-muted">{label}</div>
  <div class="flex flex-col gap-1.5">
    {#if hasNestedFields}
      {@render children?.()}
    {:else}
      <div class="text-xs text-vsc-muted">No nested fields defined.</div>
    {/if}
  </div>
</div>
