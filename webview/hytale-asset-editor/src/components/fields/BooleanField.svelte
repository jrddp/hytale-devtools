<script lang="ts">
  import type { BooleanField as BooleanFieldType } from "@shared/fieldTypes";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: BooleanFieldType } = $props();
</script>

<FieldPanel {field} inline>
  <label class="flex items-center gap-2 text-sm">
    <input class="size-8" type="checkbox" checked={Boolean(field.default)} disabled />
  </label>
</FieldPanel>
