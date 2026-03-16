<script lang="ts">
  import SingleLineAutocompleteInput from "../../../../shared/components/SingleLineAutocompleteInput.svelte";
  import { workspace } from "../../workspace.svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import type { StringFieldInstance } from "../../parsing/fieldInstances";
  import { getFieldEditorId } from "../fieldEditorIds";

  let { field, depth = 0 }: { field: StringFieldInstance; depth?: number } = $props();

  let inputId = $derived(getFieldEditorId(field));
  const summary = $derived(
    field.enumVals?.length
      ? `${field.enumVals.length} options`
      : field.pattern
        ? "Patterned string"
        : field.const
          ? "Constant value"
          : "",
  );
  const placeholder = $derived(
    field.const ?? field.default?.toString() ?? field.enumVals?.slice(0, 3).join(", ") ?? "Text",
  );
  const value = $derived(typeof field.value === "string" ? field.value : "");
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
</script>

<FieldPanel {field} {depth} {summary} inline>
  <SingleLineAutocompleteInput
    {inputId}
    initialValue={value}
    {placeholder}
    autocompleteOptions={autocompleteOptions}
    inputClass="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
    listClass="absolute left-0 right-0 top-full z-[160] max-h-40 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
    optionClass="block w-full cursor-pointer px-3 py-2 text-left text-sm text-vsc-input-fg hover:bg-vsc-list-hover"
    previewClass="z-[160]"
    onfocusrequestautocomplete={requestAutocomplete}
    oncommit={commitValue}
    onentercommit={input => input.blur()}
  />
</FieldPanel>
