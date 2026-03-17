<script lang="ts">
  import { onMount } from "svelte";
  import type { RawJsonFieldInstance } from "../../parsing/fieldInstances";
  import FieldPanel from "../FieldPanel.svelte";

  let { field, depth = 0 }: { field: RawJsonFieldInstance; depth?: number } = $props();

  let draftValue = $state("");

  onMount(() => {
    draftValue = field.value;
  });

  function commitValue() {
    let asJsonObject;
    try {
      asJsonObject = JSON.parse(draftValue);
    } catch {
      draftValue = field.value;
      return;
    }

    field.value = asJsonObject.stringify(asJsonObject, null, 2);
  }
</script>

<FieldPanel {field} {depth} summary="Raw JSON">
  <textarea
    class="w-full px-3 py-2 border rounded-md min-h-28 border-vsc-border bg-vsc-input-bg text-vsc-input-fg"
    bind:value={draftValue}
    placeholder={"{ ... }"}
    onblur={commitValue}
    onkeydown={event => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.currentTarget.blur();
      }
    }}
  ></textarea>
</FieldPanel>
