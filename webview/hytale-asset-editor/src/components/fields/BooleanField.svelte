<script lang="ts">
  import FieldPanel from "../FieldPanel.svelte";
  import type { BooleanFieldInstance } from "../../parsing/fieldInstances";

  let { field, depth = 0 }: { field: BooleanFieldInstance; depth?: number } = $props();

  const checked = $derived(typeof field.value === "boolean" ? field.value : Boolean(field.default));
</script>

<FieldPanel {field} {depth} inline>
  <label class="flex items-center gap-2 text-sm">
    <input class="size-8" type="checkbox" {checked} disabled />
  </label>
</FieldPanel>
