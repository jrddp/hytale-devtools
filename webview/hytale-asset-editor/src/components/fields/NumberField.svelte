<script lang="ts">
  import FieldPanel from "../FieldPanel.svelte";
  import type { NumberFieldInstance } from "../../parsing/fieldInstances";

  let { field, depth = 0 }: { field: NumberFieldInstance; depth?: number } = $props();

  const summary = $derived(
    [field.minimum, field.maximum].some(value => value !== undefined)
      ? `${field.minimum ?? "−∞"} to ${field.maximum ?? "∞"}`
      : field.isInteger
        ? "Integer"
        : "",
  );
  const value = $derived(field.value === undefined ? "" : String(field.value));
</script>

<FieldPanel {field} {depth} {summary} inline>
  <input
    type="text"
    class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
    {value}
    placeholder={field.default?.toString() ?? "Number"}
    disabled
  />
</FieldPanel>
