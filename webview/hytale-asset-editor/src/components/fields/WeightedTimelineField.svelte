<script lang="ts">
  import FieldPanel from "../FieldPanel.svelte";
  import { workspace } from "../../workspace.svelte";
  import type { WeightedTimelineFieldInstance } from "../../parsing/fieldInstances";

  let { field, depth = 0 }: { field: WeightedTimelineFieldInstance; depth?: number } = $props();

  const value = $derived(
    field.unparsedData === undefined ? "" : JSON.stringify(field.unparsedData, null, 2),
  );

  let draftValue = $state("");

  $effect(() => {
    draftValue = value;
  });

  function commitValue() {
    const trimmedValue = draftValue.trim();
    if (!trimmedValue) {
      field.unparsedData = undefined;
      field.isPresent = false;
      workspace.applyDocumentState();
      return;
    }

    try {
      field.unparsedData = JSON.parse(trimmedValue);
      field.isPresent = true;
      workspace.applyDocumentState();
    } catch {
      draftValue = value;
    }
  }
</script>

<FieldPanel field={field} {depth} summary="Weighted timeline field - raw JSON editor">
  <textarea
    class="min-h-28 w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
    bind:value={draftValue}
    placeholder={"[ ... ]"}
    onblur={commitValue}
  ></textarea>
</FieldPanel>
