<script lang="ts">
  import FieldPanel from "../FieldPanel.svelte";
  import type { StringFieldInstance } from "../../parsing/fieldInstances";

  let { field, depth = 0 }: { field: StringFieldInstance; depth?: number } = $props();

  const summary = $derived(
    field.enumVals?.length
      ? `${field.enumVals.length} options`
      : field.pattern
        ? "Patterned string"
        : field.const
          ? "Constant value"
          : "",
  );
  const placeholder = $derived(
    field.const ?? field.default?.toString() ?? field.enumVals?.slice(0, 3).join(", ") ?? "Text",
  );
  const value = $derived(typeof field.value === "string" ? field.value : "");
</script>

<FieldPanel {field} {depth} {summary} inline>
  <input
    type="text"
    class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
    {value}
    {placeholder}
    disabled
  />
</FieldPanel>
