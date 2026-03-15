<script lang="ts">
  import type { StringField as StringFieldType } from "@shared/fieldTypes";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: StringFieldType } = $props();

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
</script>

<FieldPanel {field} {summary}>
  <input
    type="text"
    class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
    {placeholder}
    disabled
  />
</FieldPanel>
