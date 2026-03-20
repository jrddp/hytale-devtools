<script lang="ts">
  import type { RenderFieldProps } from "src/common";
  import { onMount } from "svelte";
  import type { RawJsonFieldInstance } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  let {
    field,
    depth = 0,
    readOnly = false,
    fieldPanelOverrides,
    handle,
  }: RenderFieldProps<RawJsonFieldInstance> = $props();

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

    field.value = JSON.stringify(asJsonObject, null, 2);
    workspace.applyDocumentState();
  }
</script>

<FieldPanel {field} {depth} {readOnly} {fieldPanelOverrides} {handle} summary="Raw JSON">
  <textarea
    class="w-full px-3 py-2 border rounded-md min-h-28 border-vsc-border bg-vsc-input-bg text-vsc-input-fg"
    bind:value={draftValue}
    placeholder={"{ ... }"}
    readonly={readOnly}
    onblur={commitValue}
    onkeydown={event => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.currentTarget.blur();
      }
    }}
  ></textarea>
</FieldPanel>
