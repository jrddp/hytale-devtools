<script lang="ts">
  import FieldLayout from "src/fields/FieldLayout.svelte";
  import type { FieldProps } from "src/node-editor/utils/fieldUtils";
  import { noMousePropogation } from "src/node-editor/utils/fieldUtils";

  let {
    inputId,
    label,
    description,
    initialValue,
    onconfirm,
  }: FieldProps<boolean> = $props();

  let value = $state(false);
  let lastCommittedValue = $state(false);

  $effect(() => {
    if (initialValue !== lastCommittedValue) {
      value = initialValue;
      lastCommittedValue = initialValue;
    }
  });

  function confirmValue() {
    if (value === lastCommittedValue) {
      return;
    }

    onconfirm(value);
    lastCommittedValue = value;
  }
</script>

<FieldLayout {inputId} {label} {description} align="center">
  <input
    id={inputId}
    class="h-4 w-4 nodrag"
    type="checkbox"
    bind:checked={value}
    onchange={confirmValue}
    {...noMousePropogation}
  />
</FieldLayout>
