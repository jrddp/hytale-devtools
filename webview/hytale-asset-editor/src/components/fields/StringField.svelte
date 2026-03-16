<script lang="ts">
  import SingleLineAutocompleteInput from "../../../../shared/components/SingleLineAutocompleteInput.svelte";
  import type { StringFieldInstance } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
  import { getFieldEditorId } from "../fieldEditorIds";
  import FieldPanel from "../FieldPanel.svelte";

  let {
    field,
    depth = 0,
    onunset,
  }: {
    field: StringFieldInstance;
    depth?: number;
    onunset?: () => void;
  } = $props();

  let inputId = $derived(getFieldEditorId(field));

  const value = $derived(typeof field.value === "string" ? field.value : "");
  const isSet = $derived(
    field.value !== undefined || field.unparsedData !== undefined || Boolean(field.isPresent),
  );
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

    const symbolLookup = $state.snapshot(field.symbolRef);
    workspace.vscode.postMessage({
      type: "autocompleteRequest",
      symbolLookup,
      fieldId: inputId,
    });
  }

  function commitValue(nextValue: string) {
    field.value = nextValue;
    field.unparsedData = undefined;
    field.isPresent = true;
    workspace.applyDocumentState();
  }

  function unsetValue() {
    field.value = undefined;
    field.unparsedData = undefined;
    field.isPresent = false;
    workspace.applyDocumentState();
  }
</script>

<FieldPanel {field} {depth} inline onunset={isSet ? (onunset ?? unsetValue) : undefined}>
  <SingleLineAutocompleteInput
    {inputId}
    initialValue={value}
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
