<script lang="ts">
  import type { RenderFieldProps } from "src/common";
  import ReadOnlyInputWrapper from "src/components/ReadOnlyInputWrapper.svelte";
  import { onMount } from "svelte";
  import type { ColorFieldInstance } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
  import { getFieldPlaceholder } from "../fieldHelpers";
  import FieldPanel from "../FieldPanel.svelte";

  let {
    field,
    depth = 0,
    readOnly = false,
    readOnlyMessage,
    fieldPanelOverrides,
    onunset,
  }: RenderFieldProps<ColorFieldInstance> = $props();

  const isSet = $derived(field.value !== undefined);
  const placeholder = $derived(getFieldPlaceholder(field));
  const hasFallbackPlaceholder = $derived(
    field.inheritedValue !== undefined || field.default !== undefined,
  );
  const inputValue = $derived.by(() => {
    if (field.value !== undefined) {
      return field.value;
    }

    if (readOnly) {
      return field.inheritedValue ?? field.default ?? "";
    }

    return "";
  });

  let draftValue = $state<string>();

  onMount(() => {
    draftValue = inputValue;
  });

  $effect(() => {
    draftValue = inputValue;
  });

  function commitValue() {
    draftValue = draftValue.trim();
    if (!draftValue) {
      unsetValue();
      return;
    }

    if (!draftValue.match(/^#([0-9a-fA-F]{6})$/)) {
      draftValue = field.value;
      return;
    }

    if (draftValue === field.value) {
      return;
    }

    field.value = draftValue;
    workspace.applyDocumentState();
  }

  function unsetValue() {
    if (field.value === undefined) {
      return;
    }

    field.value = undefined;
    workspace.applyDocumentState();
  }
</script>

<FieldPanel
  {field}
  {depth}
  {readOnly}
  fieldPanelOverrides={fieldPanelOverrides}
  summary={field.colorType}
  inline
  onunset={!readOnly && isSet ? (onunset ?? unsetValue) : undefined}
>
  <ReadOnlyInputWrapper readOnly={readOnly} {readOnlyMessage} class="min-w-0">
    <div class="flex items-center gap-3">
      <input
        type="color"
        class="w-8 h-8 border rounded-md border-vsc-border {readOnly
          ? 'opacity-70 bg-vsc-panel-readonly'
          : ''}"
        class:cursor-default={readOnly}
        bind:value={draftValue}
        disabled={readOnly}
        onchange={commitValue}
      />
      {#if readOnly}
        <div
          class="flex-1 rounded-md border border-vsc-border bg-vsc-panel-readonly px-3 py-2 text-vsc-input-fg font-semibold select-text whitespace-pre-wrap break-all"
        >
          {inputValue !== "" ? inputValue : placeholder}
        </div>
      {:else}
        <input
          type="text"
          class="flex-1 px-3 py-2 border rounded-md border-vsc-border bg-vsc-input-bg text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
          bind:value={draftValue}
          {placeholder}
          class:placeholder:italic={!hasFallbackPlaceholder}
          spellcheck="false"
          onblur={commitValue}
          onkeydown={event => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              commitValue();
              event.currentTarget.blur();
            }
          }}
        />
      {/if}
    </div>
  </ReadOnlyInputWrapper>
</FieldPanel>
