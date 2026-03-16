<script lang="ts">
  import FieldPanel from "../FieldPanel.svelte";
  import type { WeightedTimelineFieldInstance } from "../../parsing/fieldInstances";

  let { field, depth = 0 }: { field: WeightedTimelineFieldInstance; depth?: number } = $props();
</script>

<FieldPanel field={field} {depth} summary="Weighted timeline field - not yet implemented" inline>
  <div class="rounded-md border border-dashed border-vsc-border px-3 py-3 opacity-70">
    {field.unparsedData === undefined
      ? "Weighted timeline entries will render here."
      : "Document data loaded for this weighted timeline field."}
  </div>
</FieldPanel>
