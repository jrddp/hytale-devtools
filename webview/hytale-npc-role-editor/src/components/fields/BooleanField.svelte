<script lang="ts">
  import { onMount } from "svelte";
  import type { NpcPropertyScalarField } from "../../propertyModel";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: NpcPropertyScalarField } = $props();

  let checked = $state(false);

  onMount(() => {
    checked = Boolean(field.value);
  });
</script>

<FieldPanel
  title={field.label}
  typeLabel={field.typeLabel}
  description={field.description}
  infoItems={field.infoItems}
>
  <div class="inline-flex">
    <input
      class="size-6 accent-vsc-activity-bar-badge-bg"
      type="checkbox"
      bind:checked
    />
  </div>
</FieldPanel>
