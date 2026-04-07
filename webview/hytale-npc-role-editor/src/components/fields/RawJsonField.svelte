<script lang="ts">
  import type { NpcPropertyRawJsonField } from "../../propertyModel";
  import { workspace } from "../../workspace.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: NpcPropertyRawJsonField } = $props();

  let draftValue = $state("");

  $effect(() => {
    draftValue = JSON.stringify(field.value, null, 2);
  });

  function commitRawJsonValue() {
    try {
      workspace.updateFieldValue(field.fieldPath, JSON.parse(draftValue));
    } catch {
      draftValue = JSON.stringify(field.value, null, 2);
    }
  }
</script>

<FieldPanel
  title={field.label}
  typeLabel={field.typeLabel}
  description={field.description}
  infoItems={field.infoItems}
  issues={field.issues}
>
  <textarea
    data-vscode-context={"{}"}
    class="min-h-28 w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
    bind:value={draftValue}
    placeholder={"{ ... }"}
    onblur={commitRawJsonValue}
    onkeydown={event => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        commitRawJsonValue();
        event.currentTarget.blur();
      }
    }}
  ></textarea>
</FieldPanel>
