<script lang="ts">
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import { buildFieldInputId, noMousePropogation } from "./fieldInteractions";

  let {
    nodeId,
    schemaKey,
    type,
    label,
    value,
    onchange,
  }: NodeField & { nodeId?: string; onchange: (value: unknown) => void } = $props();

  const fieldLabel = $derived(label ?? schemaKey ?? "Field");
  const checked = $derived(Boolean(value));
  const inputId = $derived(buildFieldInputId("bool", nodeId, schemaKey, type));

  function emitValue(nextValue: boolean) {
    onchange(nextValue);
  }
</script>

<div class="flex flex-row items-center justify-start gap-2">
  <label class="text-xs text-vsc-muted w-fit" for={inputId}>{fieldLabel}</label>
  <input
    id={inputId}
    class="w-4 h-4 nodrag"
    type="checkbox"
    {checked}
    onchange={event => emitValue(event.currentTarget.checked)}
    {...noMousePropogation}
  />
</div>
