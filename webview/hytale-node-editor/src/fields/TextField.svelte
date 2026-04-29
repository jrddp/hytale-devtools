<script lang="ts">
  import { onDestroy } from "svelte";
  import FieldLayout from "@node-editor/fields/FieldLayout.svelte";
  import type { FieldProps } from "@node-editor/node-editor/utils/fieldUtils";
  import { noMousePropogation } from "@node-editor/node-editor/utils/fieldUtils";
  import { useNodeEditorSession } from "@node-editor/workspace.svelte";
  import type { IndexReference } from "@shared/indexTypes";
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import { focusNextEditableInNode } from "@node-editor/node-editor/utils/focusNavigation";
  import SingleLineAutocompleteInput from "../../../shared/components/SingleLineAutocompleteInput.svelte";
  import type { Snippet } from "svelte";

  let {
    inputId,
    label,
    description,
    initialValue,
    placeholder = "",
    inputWidth,
    multiline = false,
    overrideAutocompleteValues,
    symbolLookup,
    previewFeatureKind,
    titleActions,
    vscodeContext,
    nativeContextTarget,
    onconfirm,
  }: FieldProps<string> & {
    placeholder?: string;
    multiline?: boolean;
    overrideAutocompleteValues?: string[];
    symbolLookup?: IndexReference;
    previewFeatureKind?: NodeField["previewFeatureKind"];
    titleActions?: Snippet;
    vscodeContext?: string;
    nativeContextTarget?: boolean;
  } = $props();
  const workspace = useNodeEditorSession();

  let value = $state("");
  let lastCommittedValue = "";

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
      workspace.postMessageToHost({
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

  function handleConsideredPreview(value?: string) {
    if (previewFeatureKind !== "animation") {
      return;
    }

    if (value === undefined) {
      workspace.clearConsideredPreviewFeature("animation");
      return;
    }

    workspace.setConsideredPreviewFeature("animation", value);
  }

  onDestroy(() => {
    if (previewFeatureKind === "animation") {
      workspace.clearConsideredPreviewFeature("animation");
    }
  });
</script>

<FieldLayout
  {inputId}
  {label}
  {description}
  align={multiline ? "start" : "center"}
  {titleActions}
  {vscodeContext}
  {nativeContextTarget}
>
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
        {placeholder}
        onblur={confirmValue}
        {...noMousePropogation}
      ></textarea>
    {:else}
      <SingleLineAutocompleteInput
        {inputId}
        initialValue={value}
        {placeholder}
        autocompleteOptions={autocompleteOptions}
        inputClass="w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg nodrag"
        listClass="nodrag nowheel absolute left-0 right-0 top-full z-40 max-h-32 overflow-auto rounded-t-none rounded-md border border-vsc-input-border bg-vsc-editor-widget-bg shadow-lg"
        optionClass="block w-full cursor-pointer px-2 py-1 text-left text-xs text-vsc-input-fg hover:bg-vsc-list-hover"
        stopPointerPropagation
        onfocus={requestAutocomplete}
        onconsider={handleConsideredPreview}
        oncommit={nextValue => {
          value = nextValue;
          confirmValue();
        }}
        afterEnterPressed={handleEnterCommit}
      />
    {/if}
  </div>
</FieldLayout>
