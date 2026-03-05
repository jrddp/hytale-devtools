<script lang="ts">
  import type { FieldProps } from "src/node-editor/utils/fieldUtils";
  import { noMousePropogation } from "src/node-editor/utils/fieldUtils";
  import {
    focusNextEditableInNode,
    isPlainEnterNavigationEvent,
  } from "../node-editor/ui/focusNavigation";

  // TODO support rgb format
  type ColorStringFormat = "hex" | "rgb";

  let { inputId, label, initialValue, onconfirm }: FieldProps<string> = $props();

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

<div class="flex flex-col gap-1">
  <label class="text-xs text-vsc-muted w-fit" for={inputId}>{label}</label>
  <div class="flex items-center w-64 gap-2">
    <input
      id={inputId}
      class="rounded-md nodrag size-8"
      type="color"
      bind:value={value}
      onchange={confirmValue}
      {...noMousePropogation}
    />
    <input
      class="nodrag flex-1 rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
      type="text"
      bind:value
      onkeydown={handleKeyDown}
      onblur={confirmValue}
      spellcheck="false"
      {...noMousePropogation}
    />
  </div>
</div>
