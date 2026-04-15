<script lang="ts">
  import FieldLayout from "@node-editor/fields/FieldLayout.svelte";
  import type { FieldProps } from "@node-editor/node-editor/utils/fieldUtils";
  import { noMousePropogation } from "@node-editor/node-editor/utils/fieldUtils";
  import { focusNextEditableInNode, isPlainEnterNavigationEvent } from "@node-editor/node-editor/utils/focusNavigation";
  import type { Snippet } from "svelte";

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

<FieldLayout {inputId} {label} {description} align="center" {titleActions}>
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
