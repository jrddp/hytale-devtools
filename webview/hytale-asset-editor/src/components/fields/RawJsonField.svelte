<script lang="ts">
  import FieldPanel from "../FieldPanel.svelte";
  import { workspace } from "../../workspace.svelte";
  import type { RawJsonFieldInstance } from "../../parsing/fieldInstances";

  let { field, depth = 0 }: { field: RawJsonFieldInstance; depth?: number } = $props();

  const value = $derived(
    field.unparsedData === undefined ? "" : JSON.stringify(field.unparsedData, null, 2),
  );

  let draftValue = $state("");
  let lastCommittedValue = $state("");

  $effect(() => {
    if (value !== lastCommittedValue) {
      draftValue = value;
      lastCommittedValue = value;
    }
  });

  function commitValue() {
    const trimmedValue = draftValue.trim();
    if (!trimmedValue) {
      if (lastCommittedValue === "") {
        return;
      }

      field.unparsedData = undefined;
      draftValue = "";
      lastCommittedValue = "";
      workspace.applyDocumentState();
      return;
    }

    if (draftValue === lastCommittedValue) {
      return;
    }

    try {
      field.unparsedData = JSON.parse(trimmedValue);
      draftValue = JSON.stringify(field.unparsedData, null, 2);
      lastCommittedValue = draftValue;
      workspace.applyDocumentState();
    } catch {
      draftValue = lastCommittedValue;
    }
  }
</script>

<FieldPanel {field} {depth} summary="Raw JSON">
  <textarea
    class="w-full px-3 py-2 border rounded-md min-h-28 border-vsc-border bg-vsc-input-bg text-vsc-input-fg"
    bind:value={draftValue}
    placeholder={"{ ... }"}
    onblur={commitValue}
  ></textarea>
</FieldPanel>
