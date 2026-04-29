<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import {
    handleCommitInputKeydown,
    type CommitEnterBehavior,
  } from "./inputCommitBehavior";

  let {
    inputId,
    initialValue,
    inputElement = $bindable(),
    inputClass = "",
    enterBehavior = "blur",
    focusRootSelector,
    stopPointerPropagation = false,
    oncommit,
    onfocus,
    ...inputAttributes
  }: {
    inputId: string;
    initialValue?: string;
    inputElement?: HTMLInputElement;
    inputClass?: string;
    enterBehavior?: CommitEnterBehavior;
    focusRootSelector?: string;
    stopPointerPropagation?: boolean;
    oncommit?: (value: string) => boolean | void;
    onfocus?: () => void;
  } & Omit<HTMLInputAttributes, "id" | "type" | "value" | "class"> = $props();

  let value = $state("");
  let lastCommittedValue = "";

  $effect(() => {
    const nextValue = initialValue ?? "";
    if (nextValue !== lastCommittedValue) {
      value = nextValue;
      lastCommittedValue = nextValue;
    }
  });

  function stopPointerEvent(event: MouseEvent | PointerEvent) {
    if (stopPointerPropagation) {
      event.stopPropagation();
    }
  }

  function confirmValue() {
    if (value === lastCommittedValue) {
      return true;
    }

    const commitResult = oncommit?.(value);
    if (commitResult === false) {
      value = lastCommittedValue;
      return false;
    }

    lastCommittedValue = value;
    return true;
  }
</script>

<input
  bind:this={inputElement}
  id={inputId}
  type="text"
  class={inputClass}
  bind:value
  {...inputAttributes}
  onfocus={onfocus}
  onkeydown={event =>
    handleCommitInputKeydown(event, {
      confirmValue,
      enterBehavior,
      focusRootSelector,
    })}
  onblur={confirmValue}
  onpointerdown={stopPointerEvent}
  onmousedown={stopPointerEvent}
  onclick={stopPointerEvent}
/>
