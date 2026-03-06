<script lang="ts">
  import FieldLayout from "src/fields/FieldLayout.svelte";
  import type { FieldProps } from "src/node-editor/utils/fieldUtils";
  import { noMousePropogation } from "src/node-editor/utils/fieldUtils";
  import { focusNextEditableInNode, isPlainEnterNavigationEvent } from "src/node-editor/utils/focusNavigation";

  // TODO support rgb format
  type ColorStringFormat = "hex" | "rgb";

  let { inputId, label, description, initialValue, inputWidth, onconfirm }: FieldProps<string> =
    $props();

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

  function handleKeyDown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
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
  <div class="flex w-full min-w-0 items-center gap-2">
    <input
      id={inputId}
      class="size-8 shrink-0 rounded-md nodrag"
      type="color"
      bind:value={value}
      onchange={confirmValue}
      {...noMousePropogation}
    />
    <input
      class="nodrag min-w-0 rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
      class:flex-1={inputWidth === undefined}
      type="text"
      style:width={inputWidth !== undefined ? `${inputWidth}px` : undefined}
      bind:value
      onkeydown={handleKeyDown}
      onblur={confirmValue}
      spellcheck="false"
      {...noMousePropogation}
    />
  </div>
</FieldLayout>
