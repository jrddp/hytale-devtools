<script lang="ts">
  import type { NumberField as NumberFieldType } from "@shared/fieldTypes";
  import FieldPanel from "../FieldPanel.svelte";

  let { field, depth = 0 }: { field: NumberFieldType; depth?: number } = $props();

  const summary = $derived(
    [field.minimum, field.maximum].some(value => value !== undefined)
      ? `${field.minimum ?? "−∞"} to ${field.maximum ?? "∞"}`
      : field.isInteger
        ? "Integer"
        : "",
  );
</script>

<FieldPanel {field} {depth} {summary} inline>
  <input
    type="text"
    class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
    placeholder={field.default?.toString() ?? "Number"}
    disabled
  />
</FieldPanel>
