<script lang="ts">
  import type { TimelineField as TimelineFieldType } from "@shared/fieldTypes";
  import FieldPanel from "../FieldPanel.svelte";

  let { field, depth = 0 }: { field: TimelineFieldType; depth?: number } = $props();
</script>

<FieldPanel field={field} {depth} summary="Timeline field - not yet implemented" inline>
  <div class="rounded-md border border-dashed border-vsc-border px-3 py-3 opacity-70">
    Timeline entries will render here.
  </div>
</FieldPanel>
