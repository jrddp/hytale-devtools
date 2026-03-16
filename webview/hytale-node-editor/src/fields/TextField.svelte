<script lang="ts">
  import FieldLayout from "src/fields/FieldLayout.svelte";
  import type { FieldProps } from "src/node-editor/utils/fieldUtils";
  import { noMousePropogation } from "src/node-editor/utils/fieldUtils";
  import { workspace } from "src/workspace.svelte";
  import { type SemanticReference } from "../../../../src/shared/schema/types";
  import { focusNextEditableInNode } from "src/node-editor/utils/focusNavigation";
  import SingleLineAutocompleteInput from "../../../shared/components/SingleLineAutocompleteInput.svelte";

  let {
    inputId,
    label,
    description,
    initialValue,
    inputWidth,
    multiline = false,
    overrideAutocompleteValues,
    symbolLookup,
    onconfirm,
  }: FieldProps<string> & {
    multiline?: boolean;
    overrideAutocompleteValues?: string[];
    symbolLookup?: SemanticReference;
  } = $props();

  let value = $state("");
  let lastCommittedValue = $state("");

  $effect(() => {
    if (initialValue !== lastCommittedValue) {
      value = initialValue;
      lastCommittedValue = initialValue;
    }
  });

  let usesOverrideAutocomplete = $derived(overrideAutocompleteValues !== undefined);
  let autocompleteValues = $derived(
    usesOverrideAutocomplete
      ? (overrideAutocompleteValues ?? [])
      : workspace.autocompleteField === inputId
        ? workspace.autocompleteValues
        : [],
  );
  let autocompleteOptions = $derived(
    autocompleteValues.map(optionValue => ({
      value: optionValue,
    })),
  );

  function confirmValue() {
    if (value === lastCommittedValue) {
      return;
    }

    onconfirm(value);
    lastCommittedValue = value;
  }

  function requestAutocomplete() {
    if (!usesOverrideAutocomplete && symbolLookup !== undefined) {
      workspace.vscode.postMessage({
        type: "autocompleteRequest",
        symbolLookup: symbolLookup,
        fieldId: inputId,
      });
    }
  }

  function handleEnterCommit(input: HTMLInputElement) {
    if (!focusNextEditableInNode(input)) {
      input.blur();
    }
  }
</script>

<FieldLayout {inputId} {label} {description} align={multiline ? "start" : "center"}>
  <div
    class="relative min-w-0"
    class:w-full={inputWidth === undefined}
    style:width={inputWidth !== undefined ? `${inputWidth}px` : undefined}
  >
    {#if multiline}
      <textarea
        id={inputId}
        class="nodrag h-20 min-h-10 w-full resize-none rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
        rows="4"
        bind:value
        onblur={confirmValue}
        {...noMousePropogation}
      ></textarea>
    {:else}
      <SingleLineAutocompleteInput
        {inputId}
        initialValue={value}
        autocompleteOptions={autocompleteOptions}
        inputClass="w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg nodrag"
        listClass="nodrag nowheel absolute left-0 right-0 top-full z-40 max-h-40 overflow-auto rounded-t-none rounded-md border border-vsc-input-border bg-vsc-editor-widget-bg shadow-lg"
        optionClass="block w-full cursor-pointer px-2 py-1 text-left text-xs text-vsc-input-fg hover:bg-vsc-list-hover"
        stopPointerPropagation
        onfocus={requestAutocomplete}
        oncommit={nextValue => {
          value = nextValue;
          confirmValue();
        }}
        afterEnterPressed={handleEnterCommit}
      />
    {/if}
  </div>
</FieldLayout>
