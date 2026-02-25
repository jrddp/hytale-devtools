<script lang="ts">
  import type { NodeField } from "@shared/node-editor/workspaceTypes";

  let {
    schemaKey,
    type,
    label,
    value,
    onchange,
  }: NodeField & { onchange: (value: unknown) => void } = $props();

  const fieldLabel = $derived(label ?? schemaKey ?? "Field");
  const checked = $derived(Boolean(value));
  const inputId = $derived(`bool-${schemaKey ?? "field"}-${type}`);

  function emitValue(nextValue: boolean) {
    onchange(nextValue);
  }
</script>

<div class="flex flex-row items-center justify-start gap-2">
  <label class="text-xs text-vsc-muted" for={inputId}>{fieldLabel}</label>
  <input
    id={inputId}
    class="nodrag h-4 w-4"
    type="checkbox"
    checked={checked}
    onchange={event => emitValue(event.currentTarget.checked)}
  />
</div>
