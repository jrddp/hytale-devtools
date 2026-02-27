<script lang="ts">
  import type { FieldProps } from "../utils/fieldUtils";
  import {
    focusNextEditableInNode,
    isPlainEnterNavigationEvent,
  } from "../node-editor/ui/focusNavigation";
  import { noMousePropogation } from "../utils/fieldUtils";

  let {
    inputId,
    label,
    initialValue,
    isFloat = false,
    onconfirm,
  }: FieldProps<number> & {
    isFloat?: boolean;
  } = $props();

  const step = $derived(isFloat ? "any" : "1");

  let value = $state(0);
  let lastCommittedValue = $state(0);

  $effect(() => {
    if (initialValue !== lastCommittedValue) {
      value = initialValue;
      lastCommittedValue = initialValue;
    }
  });

  function confirmValue() {
    const nextValue = isFloat ? value : Math.trunc(value);
    value = nextValue;
    if (nextValue === lastCommittedValue) {
      return;
    }

    onconfirm(nextValue);
    lastCommittedValue = nextValue;
  }

  function handleEnterNavigation(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (!isPlainEnterNavigationEvent(event)) {
      return;
    }

    event.preventDefault();
    confirmValue();
    if (!focusNextEditableInNode(event.currentTarget)) {
      event.currentTarget.blur();
    }
  }
</script>

<div class="flex flex-col gap-1">
  <label class="text-xs text-vsc-muted w-fit" for={inputId}>{label}</label>
  <input
    id={inputId}
    class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
    type="number"
    bind:value
    {step}
    onkeydown={handleEnterNavigation}
    onblur={confirmValue}
    {...noMousePropogation}
  />
</div>
