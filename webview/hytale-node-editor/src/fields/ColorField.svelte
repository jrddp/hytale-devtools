<script lang="ts">
  import FieldLayout from "@node-editor/fields/FieldLayout.svelte";
  import type { FieldProps } from "@node-editor/node-editor/utils/fieldUtils";
  import { noMousePropogation } from "@node-editor/node-editor/utils/fieldUtils";
  import CommitTextInput from "../../../shared/components/inputs/CommitTextInput.svelte";
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

  const textInputClass =
    "nodrag min-w-0 rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg";
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
    <CommitTextInput
      inputId={`${inputId}-text`}
      initialValue={value}
      inputClass={`${textInputClass} ${inputWidth === undefined ? "flex-1" : ""}`.trim()}
      style={inputWidth !== undefined ? `width: ${inputWidth}px` : undefined}
      enterBehavior="focus-next"
      focusRootSelector="[data-node-editor-root]"
      spellcheck="false"
      stopPointerPropagation
      oncommit={nextValue => {
        value = nextValue;
        confirmValue();
      }}
    />
  </div>
</FieldLayout>
