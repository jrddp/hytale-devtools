<script lang="ts">
  import type { WeightedTimelineField as WeightedTimelineFieldType } from "@shared/fieldTypes";
  import FieldPanel from "../FieldPanel.svelte";

  let { field, depth = 0 }: { field: WeightedTimelineFieldType; depth?: number } = $props();
</script>

<FieldPanel field={field} {depth} summary="Weighted timeline field - not yet implemented" inline>
  <div class="rounded-md border border-dashed border-vsc-border px-3 py-3 opacity-70">
    Weighted timeline entries will render here.
  </div>
</FieldPanel>
