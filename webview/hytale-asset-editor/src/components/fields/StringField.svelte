<script lang="ts">
  import { type RenderFieldProps } from "src/common";
  import SingleLineAutocompleteInput from "../../../../shared/components/SingleLineAutocompleteInput.svelte";
  import type { StringFieldInstance } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
  import { getFieldEditorId } from "../fieldEditorIds";
  import FieldPanel from "../FieldPanel.svelte";

  let {
    field,
    depth = 0,
    oncommitchange,
    onunset,
  }: RenderFieldProps<StringFieldInstance> & {
    oncommitchange?: (value: string) => void;
  } = $props();

  let inputId = $derived(getFieldEditorId(field));

  const isSet = $derived(field.value !== undefined);

  const autocompleteOptions = $derived(
    (field.enumVals?.length
      ? field.enumVals
      : workspace.autocompleteField === inputId
        ? workspace.autocompleteValues
        : []
    ).map((optionValue, index) => ({
      value: optionValue,
      markdownDescription: field.markdownEnumDescriptions?.[index],
    })),
  );

  function requestAutocomplete() {
    if (field.enumVals?.length || !field.symbolRef) {
      return;
    }

    workspace.vscode.postMessage({
      type: "autocompleteRequest",
      symbolLookup: $state.snapshot(field.symbolRef),
      fieldId: inputId,
    });
  }

  function commitValue(value: string) {
    console.log("Committing value", value, field.value);
    if (!value) value = undefined;
    if (value === field.value) {
      return;
    }

    field.value = value;
    workspace.applyDocumentState();
    oncommitchange?.(value);
  }
</script>

<FieldPanel
  {field}
  {depth}
  inline
  onunset={isSet ? (onunset ?? (() => commitValue(undefined))) : undefined}
>
  <SingleLineAutocompleteInput
    {inputId}
    initialValue={field.value ?? ""}
    placeholder={field.default ?? "Unset"}
    {autocompleteOptions}
    inputClass="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg {Boolean(
      field.default,
    )
      ? ''
      : 'placeholder:italic'}"
    listClass="absolute left-0 right-0 top-full z-[160] max-h-40 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
    optionClass="block w-full cursor-pointer px-3 py-2 text-left text-sm text-vsc-input-fg hover:bg-vsc-list-hover"
    previewClass="z-[160]"
    disabled={field.const !== undefined}
    onfocus={requestAutocomplete}
    oncommit={commitValue}
    afterEnterPressed={input => input.blur()}
  />
</FieldPanel>
