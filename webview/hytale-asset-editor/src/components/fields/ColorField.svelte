<script lang="ts">
  import type { ColorField as ColorFieldType } from "@shared/fieldTypes";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: ColorFieldType } = $props();

  const swatch = $derived(typeof field.default === "string" ? field.default : "#888888");
</script>

<FieldPanel field={field} summary={field.colorType} inline>
  <div class="flex items-center gap-3">
    <div class="h-8 w-8 rounded-md border border-vsc-border" style:background={swatch}></div>
    <input
      type="text"
      class="flex-1 rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
      placeholder={typeof field.default === "string" ? field.default : "#RRGGBB"}
      disabled
    />
  </div>
</FieldPanel>
