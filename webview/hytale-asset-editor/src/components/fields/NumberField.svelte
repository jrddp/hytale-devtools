<script lang="ts">
  import CommitNumberInput from "@webview-shared/components/inputs/CommitNumberInput.svelte";
  import type { RenderFieldProps } from "src/common";
  import ReadOnlyInputWrapper from "src/components/ReadOnlyInputWrapper.svelte";
  import type { NumberFieldInstance } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
  import { getFieldPlaceholder } from "../fieldHelpers";
  import { getFieldInputId } from "../fieldEditorIds";
  import FieldPanel from "../FieldPanel.svelte";

  let {
    field,
    depth = 0,
    readOnly = false,
    readOnlyMessage,
    fieldPanelOverrides,
    handle,
    onunset,
  }: RenderFieldProps<NumberFieldInstance> = $props();

  // TODO handle infinity - it isn't in any actual assets but the schema technically allows it

  const isSet = $derived(field.value !== undefined);
  const inputId = $derived(getFieldInputId(field));
  const placeholder = $derived(getFieldPlaceholder(field));
  const hasFallbackPlaceholder = $derived(
    field.inheritedValue !== undefined || field.default !== undefined,
  );
  const resolvedValue = $derived.by(() => {
    if (field.value !== undefined) {
      return field.value.toString();
    }

    if (readOnly) {
      return field.inheritedValue?.toString() ?? field.default?.toString() ?? "";
    }

    return "";
  });

  function commitValue(nextValue: number | undefined) {
    if (nextValue === field.value) {
      return;
    }
    field.value = nextValue;
    workspace.applyDocumentState();
  }

  function unsetValue() {
    commitValue(undefined);
  }
</script>

<FieldPanel
  {field}
  {depth}
  {readOnly}
  fieldPanelOverrides={fieldPanelOverrides}
  {handle}
  inline
  onunset={!readOnly && isSet ? (onunset ?? unsetValue) : undefined}
>
  <ReadOnlyInputWrapper readOnly={readOnly} {readOnlyMessage} class="w-full min-w-0">
    {#if readOnly}
      <div
        class="w-full rounded-md border border-vsc-border bg-vsc-panel-readonly px-3 py-2 text-vsc-input-fg font-semibold select-text whitespace-pre-wrap break-all"
      >
        {resolvedValue !== "" ? resolvedValue : placeholder}
      </div>
    {:else}
      <CommitNumberInput
        {inputId}
        initialValue={field.value}
        emptyValue={undefined}
        inputClass={`w-full px-3 py-2 border rounded-md border-vsc-border bg-vsc-input-bg text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100 ${!hasFallbackPlaceholder ? "placeholder:italic" : ""}`.trim()}
        {placeholder}
        integer={field.isInteger}
        minimum={field.minimum}
        maximum={field.maximum}
        oncommit={commitValue}
      />
    {/if}
  </ReadOnlyInputWrapper>
</FieldPanel>
