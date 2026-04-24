<script lang="ts">
  import FieldLayout from "@node-editor/fields/FieldLayout.svelte";
  import type { FieldProps } from "@node-editor/node-editor/utils/fieldUtils";
  import CommitTextInput from "../../../shared/components/inputs/CommitTextInput.svelte";
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

  const inputClass =
    "nodrag rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg";
</script>

<FieldLayout {inputId} {label} {description} align="center" {titleActions}>
  <CommitTextInput
    {inputId}
    initialValue={initialValue}
    inputClass={`${inputClass} ${inputWidth === undefined ? "w-full" : ""}`.trim()}
    style={inputWidth !== undefined ? `width: ${inputWidth}px` : undefined}
    enterBehavior="focus-next"
    focusRootSelector="[data-node-editor-root]"
    placeholder="path/to/file.json"
    spellcheck="false"
    stopPointerPropagation
    oncommit={onconfirm}
  />
</FieldLayout>
