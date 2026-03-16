<script lang="ts">
  import FieldPanel from "../FieldPanel.svelte";
  import type { ColorFieldInstance } from "../../parsing/fieldInstances";

  let { field, depth = 0 }: { field: ColorFieldInstance; depth?: number } = $props();

  const swatch = $derived(
    typeof field.value === "string"
      ? field.value
      : typeof field.default === "string"
        ? field.default
        : "#888888",
  );
  const value = $derived(typeof field.value === "string" ? field.value : "");
</script>

<FieldPanel field={field} {depth} summary={field.colorType} inline>
  <div class="flex items-center gap-3">
    <div class="h-8 w-8 rounded-md border border-vsc-border" style:background={swatch}></div>
    <input
      type="text"
      class="flex-1 rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
      {value}
      placeholder={typeof field.default === "string" ? field.default : "#RRGGBB"}
      disabled
    />
  </div>
</FieldPanel>
