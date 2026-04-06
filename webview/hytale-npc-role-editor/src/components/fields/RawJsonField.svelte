<script lang="ts">
  import { onMount } from "svelte";
  import type { NpcPropertyRawJsonField } from "../../propertyModel";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: NpcPropertyRawJsonField } = $props();

  let draftValue = $state("");

  onMount(() => {
    draftValue = JSON.stringify(field.value, null, 2);
  });
</script>

<FieldPanel
  title={field.label}
  description={field.description}
  infoItems={field.infoItems}
>
  <textarea
    class="min-h-28 w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
    bind:value={draftValue}
    placeholder={"{ ... }"}
  ></textarea>
</FieldPanel>
