<script lang="ts">
  import FieldLayout from "src/fields/FieldLayout.svelte";
  import type { FieldProps } from "src/node-editor/utils/fieldUtils";
  import { noMousePropogation } from "src/node-editor/utils/fieldUtils";
  import { focusNextEditableInNode, isPlainEnterNavigationEvent } from "src/node-editor/utils/focusNavigation";

  let {
    inputId,
    label,
    description,
    initialValue,
    inputWidth,
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

<FieldLayout {inputId} {label} {description} align="center">
  <input
    id={inputId}
    class="nodrag rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
    class:w-full={inputWidth === undefined}
    type="number"
    style:width={inputWidth !== undefined ? `${inputWidth}px` : undefined}
    bind:value
    {step}
    onkeydown={handleEnterNavigation}
    onblur={confirmValue}
    {...noMousePropogation}
  />
</FieldLayout>
