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

<div class="flex flex-col gap-1">
  <label class="text-xs text-vsc-muted w-fit" for={inputId}>{label}</label>
  <input
    id={inputId}
    class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
    type="text"
    bind:value
    onkeydown={handleEnterNavigation}
    onblur={confirmValue}
    placeholder="path/to/file.json"
    spellcheck="false"
    {...noMousePropogation}
  />
</div>
