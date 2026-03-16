<script lang="ts">
  import type { RawJsonField as RawJsonFieldType } from "@shared/fieldTypes";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: RawJsonFieldType } = $props();
</script>

<FieldPanel {field} summary="Raw JSON">
  <textarea
    class="w-full px-3 py-2 border rounded-md min-h-28 border-vsc-border bg-vsc-input-bg text-vsc-input-fg"
    placeholder={"{ ... }"}
    disabled
  ></textarea>
</FieldPanel>
