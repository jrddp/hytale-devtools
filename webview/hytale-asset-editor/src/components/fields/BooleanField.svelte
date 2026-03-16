<script lang="ts">
  import type { BooleanField as BooleanFieldType } from "@shared/fieldTypes";
  import FieldPanel from "../FieldPanel.svelte";

  let { field, depth = 0 }: { field: BooleanFieldType; depth?: number } = $props();
</script>

<FieldPanel {field} {depth} inline>
  <label class="flex items-center gap-2 text-sm">
    <input class="size-8" type="checkbox" checked={Boolean(field.default)} disabled />
  </label>
</FieldPanel>
