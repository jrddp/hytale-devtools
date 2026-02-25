<script lang="ts">
  import type { NodeField } from "@shared/node-editor/workspaceTypes";

  let {
    schemaKey,
    label,
    hasNestedFields = true,
  }: NodeField & { onchange: (value: unknown) => void; hasNestedFields?: boolean } = $props();

  const fieldLabel = $derived(label ?? schemaKey ?? "Field");
</script>

<div class="flex flex-col gap-1.5 rounded-md border border-dashed border-vsc-editor-widget-border p-2">
  <div class="text-xs font-bold uppercase text-vsc-muted">{fieldLabel}</div>
  <div class="flex flex-col gap-1.5">
    {#if hasNestedFields}
      <slot />
    {:else}
      <div class="text-xs text-vsc-muted">No nested fields defined.</div>
    {/if}
  </div>
</div>
