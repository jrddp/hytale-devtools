<script lang="ts">
  import type { BooleanFieldInstance } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  let {
    field,
    depth = 0,
    onunset,
  }: {
    field: BooleanFieldInstance;
    depth?: number;
    onunset?: () => void;
  } = $props();

  const isSet = $derived(field.value !== undefined);
  const checked = $derived(field.value ?? field.inheritedValue ?? field.default ?? false);
  const fallbackLabel = $derived.by(() => {
    if (field.value !== undefined) {
      return null;
    }

    if (field.inheritedValue !== undefined) {
      return "Inherited";
    }

    return "Default";
  });

  function commitValue(value: boolean) {
    field.value = value;
    workspace.applyDocumentState();
  }

  function unsetValue() {
    field.value = undefined;
    workspace.applyDocumentState();
  }
</script>

<FieldPanel {field} {depth} inline onunset={isSet ? (onunset ?? unsetValue) : undefined}>
  <div class="flex items-center gap-2">
    <input
      class="size-6 accent-vsc-activity-bar-badge-bg"
      type="checkbox"
      checked={checked}
      onchange={event => commitValue(event.currentTarget.checked)}
      class:accent-vsc-muted={!isSet}
    />
    {#if fallbackLabel}
      <div class="italic text-vsc-muted opacity-70">({fallbackLabel})</div>
    {/if}
  </div>
</FieldPanel>
