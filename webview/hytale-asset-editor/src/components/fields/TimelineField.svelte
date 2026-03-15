<script lang="ts">
  import type { TimelineField as TimelineFieldType } from "@shared/fieldTypes";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: TimelineFieldType } = $props();
</script>

<FieldPanel field={field} summary="Timeline shell">
  <div class="rounded-md border border-dashed border-vsc-border px-3 py-3 opacity-70">
    Timeline entries will render here.
  </div>
</FieldPanel>
