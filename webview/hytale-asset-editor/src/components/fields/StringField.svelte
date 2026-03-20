<script lang="ts">
  import { createTooltip } from "@webview-shared/components/tooltip/createTooltip.svelte";
  import TooltipContent from "@webview-shared/components/tooltip/TooltipContent.svelte";
  import { LoaderCircle } from "lucide-svelte";
  import { type RenderFieldProps } from "src/common";
  import ReadOnlyInputWrapper from "src/components/ReadOnlyInputWrapper.svelte";
  import SingleLineAutocompleteInput from "../../../../shared/components/SingleLineAutocompleteInput.svelte";
  import type { StringFieldInstance } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
  import { getFieldPlaceholder } from "../fieldHelpers";
  import { getFieldEditorId } from "../fieldEditorIds";
  import FieldPanel from "../FieldPanel.svelte";

  let {
    field,
    depth = 0,
    readOnly = false,
    readOnlyMessage,
    oncommitchange,
    onunset,
  }: RenderFieldProps<StringFieldInstance> & {
    oncommitchange?: (value: string | undefined) => void;
  } = $props();

  let inputId = $derived(getFieldEditorId(field));
  const isLocked = $derived(readOnly || field.const !== undefined);

  const isSet = $derived(field.value !== undefined);
  const value = $derived(
    isLocked
      ? (field.value ?? field.const ?? field.inheritedValue ?? field.default ?? "")
      : (field.value ?? ""),
  );
  const placeholder = $derived(isLocked && value !== "" ? "" : getFieldPlaceholder(field));
  const hasFallbackPlaceholder = $derived(
    field.inheritedValue !== undefined || field.default !== undefined,
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

    workspace.vscode.postMessage({
      type: "autocompleteRequest",
      symbolLookup: $state.snapshot(field.symbolRef),
      fieldId: inputId,
    });
  }

  function commitValue(value?: string) {
    const nextValue = value || undefined;
    if (nextValue === field.value) {
      return;
    }

    field.value = nextValue;
    workspace.applyDocumentState();

    if (field.definesParent) {
      workspace.setParentState({ status: "none" });
      if (nextValue) {
        workspace.vscode.postMessage({
          type: "resolveParent",
          parentName: nextValue,
        });
      }
    }

    oncommitchange?.(nextValue);
  }

  const parentTooltip = $derived(
    field.definesParent && workspace.parentStatus === "loading" ? createTooltip() : undefined,
  );
</script>

{#snippet glyphs()}
  {#if field.definesParent && workspace.parentStatus === "loading"}
    <div class="flex items-center size-4 opacity-70" {@attach parentTooltip.trigger}>
      <LoaderCircle size={12} class="duration-700 origin-center animate-spin" />
    </div>
    <TooltipContent
      tooltip={parentTooltip}
      placement="right"
      class="z-50 max-w-lg p-2 text-xs text-left border rounded-md shadow-lg border-vsc-border bg-vsc-tooltip-bg text-vsc-tooltip-fg"
    >
      <div>Assets are being loaded. Parent data will be available soon.</div>
    </TooltipContent>
  {/if}
{/snippet}

<FieldPanel
  {field}
  {depth}
  {readOnly}
  inline
  {glyphs}
  onunset={!isLocked && isSet ? (onunset ?? (() => commitValue(undefined))) : undefined}
>
  <ReadOnlyInputWrapper readOnly={isLocked} {readOnlyMessage} class="w-full min-w-0">
    {#if isLocked}
      <div
        class="w-full rounded-md border border-vsc-border bg-vsc-panel-readonly px-3 py-2 text-vsc-input-fg font-semibold select-text whitespace-pre-wrap break-all"
      >
        {value !== "" ? value : placeholder}
      </div>
    {:else}
      <SingleLineAutocompleteInput
        {inputId}
        initialValue={value}
        {placeholder}
        {autocompleteOptions}
        inputClass="w-full rounded-md border border-vsc-border px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100 bg-vsc-input-bg {(!hasFallbackPlaceholder)
          ? 'placeholder:italic'
          : ''}"
        listClass="absolute left-0 right-0 top-full z-[160] max-h-40 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
        optionClass="block w-full cursor-pointer px-3 py-2 text-left text-sm text-vsc-input-fg hover:bg-vsc-list-hover"
        previewClass="z-[160]"
        onfocus={requestAutocomplete}
        oncommit={commitValue}
        afterEnterPressed={input => input.blur()}
      />
    {/if}
  </ReadOnlyInputWrapper>
</FieldPanel>
