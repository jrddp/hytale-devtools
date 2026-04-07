<script lang="ts">
  import type { NpcPropertyScalarField } from "../../propertyModel";
  import { workspace } from "../../workspace.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: NpcPropertyScalarField } = $props();

  let checked = $state(false);

  $effect(() => {
    checked = Boolean(field.value);
  });
</script>

<FieldPanel
  title={field.label}
  typeLabel={field.typeLabel}
  description={field.description}
  infoItems={field.infoItems}
  issues={field.issues}
>
  <div class="inline-flex">
    <input
      class="size-6 accent-vsc-activity-bar-badge-bg"
      type="checkbox"
      data-vscode-context={"{}"}
      bind:checked
      onchange={event => workspace.updateFieldValue(field.fieldPath, event.currentTarget.checked)}
    />
  </div>
</FieldPanel>
