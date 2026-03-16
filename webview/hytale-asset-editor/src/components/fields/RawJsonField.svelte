<script lang="ts">
  import FieldPanel from "../FieldPanel.svelte";
  import type { RawJsonFieldInstance } from "../../parsing/fieldInstances";

  let { field, depth = 0 }: { field: RawJsonFieldInstance; depth?: number } = $props();

  const value = $derived(field.unparsedData === undefined ? "" : JSON.stringify(field.unparsedData, null, 2));
</script>

<FieldPanel {field} {depth} summary="Raw JSON">
  <textarea
    class="w-full px-3 py-2 border rounded-md min-h-28 border-vsc-border bg-vsc-input-bg text-vsc-input-fg"
    {value}
    placeholder={"{ ... }"}
    disabled
  ></textarea>
</FieldPanel>
