<script lang="ts">
  import FieldPanel from "../FieldPanel.svelte";
  import { workspace } from "../../workspace.svelte";
  import type { TimelineFieldInstance } from "../../parsing/fieldInstances";

  let {
    field,
    depth = 0,
    readOnly = false,
  }: { field: TimelineFieldInstance; depth?: number; readOnly?: boolean } = $props();

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

<FieldPanel field={field} {depth} {readOnly} summary="Timeline field - raw JSON editor">
  <textarea
    class="min-h-28 w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
    bind:value={draftValue}
    placeholder={"[ ... ]"}
    readonly={readOnly}
    onblur={commitValue}
  ></textarea>
</FieldPanel>
