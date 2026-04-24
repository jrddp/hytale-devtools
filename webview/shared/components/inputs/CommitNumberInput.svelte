<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import {
    formatNumberInputValue,
    handleCommitInputKeydown,
    parseNumberText,
    sanitizeNumberText,
    type CommitEnterBehavior,
  } from "./inputCommitBehavior";

  let {
    inputId,
    initialValue,
    emptyValue = 0,
    inputElement = $bindable(),
    inputClass = "",
    integer = false,
    minimum,
    maximum,
    enterBehavior = "blur",
    focusRootSelector,
    stopPointerPropagation = false,
    oncommit,
    onfocus,
    ...inputAttributes
  }: {
    inputId: string;
    initialValue?: number | string | null;
    emptyValue?: number | undefined;
    inputElement?: HTMLInputElement;
    inputClass?: string;
    integer?: boolean;
    minimum?: number;
    maximum?: number;
    enterBehavior?: CommitEnterBehavior;
    focusRootSelector?: string;
    stopPointerPropagation?: boolean;
    oncommit?: (value: number | undefined) => boolean | void;
    onfocus?: () => void;
  } & Omit<HTMLInputAttributes, "id" | "type" | "value" | "class" | "inputmode"> =
    $props();

  let value = $state("");
  let lastCommittedValue = "";

  $effect(() => {
    const nextValue = sanitizeNumberText(formatNumberInputValue(initialValue), {
      integer,
      minimum,
      maximum,
    });
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
    const parsed = parseNumberText(value, {
      integer,
      minimum,
      maximum,
    });

    if (parsed.kind === "invalid") {
      value = lastCommittedValue;
      return false;
    }

    const nextValue = parsed.kind === "empty" ? emptyValue : parsed.value;
    const nextText = formatNumberInputValue(nextValue);
    value = nextText;

    if (nextText === lastCommittedValue) {
      return true;
    }

    const commitResult = oncommit?.(nextValue);
    if (commitResult === false) {
      value = lastCommittedValue;
      return false;
    }

    lastCommittedValue = nextText;
    return true;
  }
</script>

<input
  bind:this={inputElement}
  id={inputId}
  type="text"
  inputmode={integer ? "numeric" : "decimal"}
  class={inputClass}
  bind:value
  {...inputAttributes}
  onfocus={onfocus}
  oninput={event => {
    value = sanitizeNumberText(event.currentTarget.value, {
      integer,
      minimum,
      maximum,
    });
  }}
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
