<script lang="ts">
  import type { RawJsonField as RawJsonFieldType } from "@shared/fieldTypes";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: RawJsonFieldType } = $props();
</script>

<FieldPanel field={field} summary="JSON editor shell">
  <textarea
    class="min-h-28 w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
    placeholder={'{ ... }'}
    disabled
  ></textarea>
</FieldPanel>
