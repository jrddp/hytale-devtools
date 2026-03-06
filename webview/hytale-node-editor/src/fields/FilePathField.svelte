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
    onconfirm,
  }: FieldProps<string> = $props();

  let value = $state("");
  let lastCommittedValue = $state("");

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
    type="text"
    style:width={inputWidth !== undefined ? `${inputWidth}px` : undefined}
    bind:value
    onkeydown={handleEnterNavigation}
    onblur={confirmValue}
    placeholder="path/to/file.json"
    spellcheck="false"
    {...noMousePropogation}
  />
</FieldLayout>
