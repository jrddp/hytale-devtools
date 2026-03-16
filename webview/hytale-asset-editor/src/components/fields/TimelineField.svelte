<script lang="ts">
  import FieldPanel from "../FieldPanel.svelte";
  import type { TimelineFieldInstance } from "../../parsing/fieldInstances";

  let { field, depth = 0 }: { field: TimelineFieldInstance; depth?: number } = $props();
</script>

<FieldPanel field={field} {depth} summary="Timeline field - not yet implemented" inline>
  <div class="rounded-md border border-dashed border-vsc-border px-3 py-3 opacity-70">
    {field.unparsedData === undefined ? "Timeline entries will render here." : "Document data loaded for this timeline field."}
  </div>
</FieldPanel>
