<script lang="ts">
  import type { Snippet } from "svelte";
  import SingleLineAutocompleteInput from "../../../../shared/components/SingleLineAutocompleteInput.svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import { getFieldEditorId } from "../fieldEditorIds";
  import { workspace } from "../../workspace.svelte";
  import type { FieldInstance, InlineOrReferenceFieldInstance } from "../../parsing/fieldInstances";

  let {
    field,
    renderField,
    depth = 0,
    onunset,
  }: {
    field: InlineOrReferenceFieldInstance;
    renderField?: Snippet<[FieldInstance, number, (() => void)?]>;
    depth?: number;
    onunset?: () => void;
  } = $props();

  const inputId = $derived(getFieldEditorId(field.stringField));
  const placeholder = $derived(
    field.stringField.default?.toString() ??
      field.stringField.enumVals?.slice(0, 3).join(", ") ??
      "Reference path",
  );
  const summary = $derived(
    field.mode === "inline" ? "Inline object" : field.mode === "string" ? "Reference path" : "",
  );
  const isSet = $derived(field.mode !== "empty" || field.unparsedData !== undefined || Boolean(field.isPresent));
  const stringValue = $derived(
    field.stringValue ?? (typeof field.stringField.value === "string" ? field.stringField.value : ""),
  );
  const autocompleteOptions = $derived(
    (field.stringField.enumVals?.length
      ? field.stringField.enumVals
      : workspace.autocompleteField === inputId
        ? workspace.autocompleteValues
        : []
    ).map((optionValue, index) => ({
      value: optionValue,
      markdownDescription: field.stringField.markdownEnumDescriptions?.[index],
    })),
  );

  function requestAutocomplete() {
    if (field.stringField.enumVals?.length || !field.stringField.symbolRef) {
      return;
    }

    workspace.vscode.postMessage({
      type: "autocompleteRequest",
      symbolLookup: $state.snapshot(field.stringField.symbolRef),
      fieldId: inputId,
    });
  }

  function commitStringValue(nextValue: string) {
    field.mode = "string";
    field.stringField.value = nextValue;
    field.stringField.unparsedData = undefined;
    field.stringField.isPresent = true;
    field.stringValue = nextValue;
    field.inlineValueField = null;
    field.unparsedData = undefined;
    field.isPresent = true;
    workspace.applyDocumentState();
  }

  function unsetValue() {
    field.stringField = workspace.createEmptyFieldInstance(field.stringField);
    field.stringValue = undefined;
    field.inlineValueField = null;
    field.mode = "empty";
    field.unparsedData = undefined;
    field.isPresent = false;
    workspace.applyDocumentState();
  }

  function changeMode(nextMode: InlineOrReferenceFieldInstance["mode"]) {
    if (nextMode === field.mode) {
      return;
    }

    if (nextMode === "empty") {
      unsetValue();
      return;
    }

    if (nextMode === "string") {
      field.stringField = workspace.createEmptyFieldInstance(field.stringField);
      field.stringValue = "";
      field.inlineValueField = null;
      field.mode = "string";
      field.unparsedData = undefined;
      field.isPresent = true;
      workspace.applyDocumentState();
      return;
    }

    field.inlineValueField = workspace.createEmptyFieldInstance(field.inlineField);
    field.stringValue = undefined;
    field.mode = "inline";
    field.unparsedData = undefined;
    field.isPresent = true;
    workspace.applyDocumentState();
  }
</script>

{#snippet modeSelector()}
  <select
    class="rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-sm text-vsc-input-fg"
    value={field.mode}
    onchange={event =>
      changeMode(event.currentTarget.value as InlineOrReferenceFieldInstance["mode"])}
  >
    <option value="empty">Unset</option>
    <option value="string">Reference</option>
    <option value="inline">Inline</option>
  </select>
{/snippet}

<FieldPanel
  field={field}
  {depth}
  summary={summary}
  inline={field.mode !== "inline"}
  onunset={field.mode !== "inline" && isSet ? (onunset ?? unsetValue) : undefined}
>
  {#if field.mode === "inline" && field.inlineValueField}
    <div class="space-y-3">
      {@render modeSelector()}
      {@render renderField?.(field.inlineValueField, depth + 1, onunset)}
    </div>
  {:else}
    <div class="flex items-center gap-3">
      {@render modeSelector()}

      {#if field.mode === "string"}
        <div class="min-w-0 flex-1">
          <SingleLineAutocompleteInput
            {inputId}
            initialValue={stringValue}
            {placeholder}
            autocompleteOptions={autocompleteOptions}
            inputClass="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
            listClass="absolute left-0 right-0 top-full z-[160] max-h-40 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
            optionClass="block w-full cursor-pointer px-3 py-2 text-left text-sm text-vsc-input-fg hover:bg-vsc-list-hover"
            previewClass="z-[160]"
            onfocus={requestAutocomplete}
            oncommit={commitStringValue}
            afterEnterPressed={input => input.blur()}
          />
        </div>
      {:else}
        <div class="rounded-md border border-dashed border-vsc-border px-3 py-2 text-sm text-vsc-muted">
          Choose a mode to set this field.
        </div>
      {/if}
    </div>
  {/if}
</FieldPanel>
