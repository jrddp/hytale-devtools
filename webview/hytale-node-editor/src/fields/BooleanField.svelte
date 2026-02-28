<script lang="ts">
  import type { FieldProps } from "src/node-editor/utils/fieldUtils";
  import { noMousePropogation } from "src/node-editor/utils/fieldUtils";

  let {
    inputId,
    label,
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

<div class="flex flex-row items-center justify-start gap-2">
  <label class="text-xs text-vsc-muted w-fit" for={inputId}>{label}</label>
  <input
    id={inputId}
    class="w-4 h-4 nodrag"
    type="checkbox"
    bind:checked={value}
    onchange={confirmValue}
    {...noMousePropogation}
  />
</div>
