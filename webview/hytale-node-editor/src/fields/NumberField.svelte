<script lang="ts">
  import FieldLayout from "@node-editor/fields/FieldLayout.svelte";
  import type { FieldProps } from "@node-editor/node-editor/utils/fieldUtils";
  import CommitNumberInput from "../../../shared/components/inputs/CommitNumberInput.svelte";
  import type { Snippet } from "svelte";

  let {
    inputId,
    label,
    description,
    initialValue,
    inputWidth,
    isFloat = false,
    titleActions,
    onconfirm,
  }: FieldProps<number> & {
    isFloat?: boolean;
    titleActions?: Snippet;
  } = $props();

  const inputClass =
    "nodrag rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg";
</script>

<FieldLayout {inputId} {label} {description} align="center" {titleActions}>
  <CommitNumberInput
    {inputId}
    initialValue={initialValue}
    integer={!isFloat}
    emptyValue={0}
    inputClass={`${inputClass} ${inputWidth === undefined ? "w-full" : ""}`.trim()}
    style={inputWidth !== undefined ? `width: ${inputWidth}px` : undefined}
    enterBehavior="focus-next"
    focusRootSelector="[data-node-editor-root]"
    stopPointerPropagation
    oncommit={value => onconfirm(value ?? 0)}
  />
</FieldLayout>
