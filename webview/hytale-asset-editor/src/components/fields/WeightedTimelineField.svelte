<script lang="ts">
  import type { WeightedTimelineField as WeightedTimelineFieldType } from "@shared/fieldTypes";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: WeightedTimelineFieldType } = $props();
</script>

<FieldPanel field={field} summary="Weighted timeline shell">
  <div class="rounded-md border border-dashed border-vsc-border px-3 py-3 opacity-70">
    Weighted timeline entries will render here.
  </div>
</FieldPanel>
