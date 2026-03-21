<script lang="ts">
  import type { RenderFieldProps } from "src/common";
  import ReadOnlyInputWrapper from "src/components/ReadOnlyInputWrapper.svelte";
  import { onMount } from "svelte";
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

  let draftValue = $state<string>();

  onMount(() => {
    draftValue = field.value?.toString();
  });

  function sanitize(value: string) {
    value = value.trim();

    if (value === "") {
      return "";
    }

    if (field.isInteger) {
      value = value.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "");
    } else {
      value = value
        .replace(/[^\d.-]/g, "")
        .replace(/(?!^)-/g, "")
        .replace(/(\..*)\./g, "$1");
    }

    if (field.maximum !== undefined && Number(value) > field.maximum) {
      value = field.maximum.toString();
    }

    if (field.minimum !== undefined && Number(value) < field.minimum) {
      value = field.minimum.toString();
    }

    return value;
  }

  function commitValue() {
    if (!draftValue) draftValue = undefined;
    const nextValue = Number(draftValue);
    if (Number.isNaN(nextValue)) {
      draftValue = field.value?.toString();
      return;
    }
    if (nextValue === field.value) return;
    field.value = nextValue;
    workspace.applyDocumentState();
  }

  function unsetValue() {
    draftValue = undefined;
    commitValue();
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
      <input
        id={inputId}
        type="text"
        class="w-full px-3 py-2 border rounded-md border-vsc-border bg-vsc-input-bg text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
        bind:value={draftValue}
        {placeholder}
        class:placeholder:italic={!hasFallbackPlaceholder}
        inputmode={field.isInteger ? "numeric" : "decimal"}
        oninput={event => {
          draftValue = sanitize(event.currentTarget.value);
        }}
        onblur={commitValue}
        onkeydown={event => {
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            commitValue();
            event.currentTarget.blur();
            return;
          }
        }}
      />
    {/if}
  </ReadOnlyInputWrapper>
</FieldPanel>
