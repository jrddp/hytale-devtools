<script lang="ts">
  import { onMount } from "svelte";
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

  let checked = $state(false);
  const isSet = $derived(field.value !== undefined);

  onMount(() => {
    checked = isSet ? checked : Boolean(field.default);
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
      {checked}
      onchange={event => commitValue(event.currentTarget.checked)}
      class:accent-vsc-muted={!isSet}
    />
    {#if !isSet}
      <div class="italic text-vsc-muted opacity-70">(Unset)</div>
    {/if}
  </div>
</FieldPanel>
