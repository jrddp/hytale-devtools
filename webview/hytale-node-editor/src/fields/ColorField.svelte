<script lang="ts">
  import FieldLayout from "@node-editor/fields/FieldLayout.svelte";
  import type { FieldProps } from "@node-editor/node-editor/utils/fieldUtils";
  import { noMousePropogation } from "@node-editor/node-editor/utils/fieldUtils";
  import { focusNextEditableInNode, isPlainEnterNavigationEvent } from "@node-editor/node-editor/utils/focusNavigation";
  import type { Snippet } from "svelte";

  // TODO support rgb format
  type ColorStringFormat = "hex" | "rgb";

  let {
    inputId,
    label,
    description,
    initialValue,
    inputWidth,
    titleActions,
    onconfirm,
  }: FieldProps<string> & {
    titleActions?: Snippet;
  } = $props();

  let value = $state("");
  let lastCommittedValue = "";

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

<FieldLayout {inputId} {label} {description} align="center" {titleActions}>
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
