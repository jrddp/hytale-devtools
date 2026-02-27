<script lang="ts">
  import type { FieldProps } from "../utils/fieldUtils";
  import { noMousePropogation } from "../utils/fieldUtils";

  let {
    inputId,
    label,
    initialValue,
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

<div class="flex flex-col gap-1">
  <label class="text-xs text-vsc-muted w-fit" for={inputId}>{fieldLabel}</label>
  <input
    id={inputId}
    class="w-full nodrag"
    type="range"
    {min}
    {max}
    {step}
    bind:value
    onchange={confirmValue}
    onblur={confirmValue}
    {...noMousePropogation}
  />
</div>
