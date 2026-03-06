<script lang="ts">
  import FieldLayout from "src/fields/FieldLayout.svelte";
  import type { FieldProps } from "src/node-editor/utils/fieldUtils";
  import { noMousePropogation } from "src/node-editor/utils/fieldUtils";

  let {
    inputId,
    label,
    description,
    initialValue,
    inputWidth,
    onconfirm,
  }: FieldProps<number> = $props();

  const min = 0;
  const max = 100;
  const step = 1;

  let value = $state(min);
  let lastCommittedValue = $state(min);

  $effect(() => {
    if (initialValue !== lastCommittedValue) {
      value = initialValue;
      lastCommittedValue = initialValue;
    }
  });

  const fieldLabel = $derived(`${label} (${value})`);

  function confirmValue() {
    const nextValue = value;
    if (nextValue === lastCommittedValue) {
      return;
    }

    onconfirm(nextValue);
    lastCommittedValue = nextValue;
  }
</script>

<FieldLayout inputId={inputId} label={fieldLabel} description={description} align="center">
  <input
    id={inputId}
    class="nodrag"
    class:w-full={inputWidth === undefined}
    type="range"
    style:width={inputWidth !== undefined ? `${inputWidth}px` : undefined}
    {min}
    {max}
    {step}
    bind:value
    onchange={confirmValue}
    onblur={confirmValue}
    {...noMousePropogation}
  />
</FieldLayout>
