<script lang="ts">
  import type { InlineOrReferenceField as InlineOrReferenceFieldType } from "@shared/fieldTypes";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: InlineOrReferenceFieldType } = $props();

  const placeholder = $derived(
    field.stringField.default?.toString() ??
      field.stringField.enumVals?.slice(0, 3).join(", ") ??
      "Reference path",
  );
</script>

<FieldPanel field={field} inline>
  <input
    type="text"
    class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
    {placeholder}
    disabled
  />
</FieldPanel>
