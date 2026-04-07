<script lang="ts">
  import ComputeAutocompleteInput from "@webview-shared/components/ComputeAutocompleteInput.svelte";
  import SingleLineAutocompleteInput from "@webview-shared/components/SingleLineAutocompleteInput.svelte";
  import { buildNpcComputeAutocompleteOptions } from "../../compute/computeAutocomplete";
  import type { NpcPropertyScalarField } from "../../propertyModel";
  import { workspace } from "../../workspace.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: NpcPropertyScalarField } = $props();

  let draftValue = $state("");

  $effect(() => {
    draftValue = String(field.value ?? "");
  });

  const panelDescription = $derived(
    field.type === "enum" && field.options?.some(option => option.value === field.value)
      ? [field.description, field.options.find(option => option.value === field.value)?.description]
          .filter(Boolean)
          .join("\n\n") || undefined
      : field.description,
  );
  const inputId = $derived(`npc-property-${field.id}`);
  const autocompleteOptions = $derived(
    (field.options?.length
      ? field.options.map(option => ({
          value: option.value,
          markdownDescription: option.description,
        }))
      : field.symbolRef && workspace.autocompleteField === inputId
        ? workspace.autocompleteValues.map(value => ({
            value,
          }))
        : []
    ),
  );
  const computeAutocompleteOptions = $derived(
    buildNpcComputeAutocompleteOptions({
      parameters: workspace.documentModel?.parameters?.entries,
      scope: "standard",
    }),
  );

  function sanitizeNumber(value: string) {
    return value
      .trim()
      .replace(/[^\d.-]/g, "")
      .replace(/(?!^)-/g, "")
      .replace(/(\..*)\./g, "$1");
  }

  function commitNumberValue() {
    const sanitized = sanitizeNumber(draftValue);
    draftValue = sanitized;
    if (sanitized === "") {
      workspace.updateFieldValue(field.fieldPath, "");
      return;
    }

    const nextValue = Number(sanitized);
    if (Number.isNaN(nextValue)) {
      draftValue = typeof field.value === "number" ? String(field.value) : "";
      return;
    }

    workspace.updateFieldValue(field.fieldPath, nextValue);
  }

  function requestAutocomplete() {
    if (field.options?.length || !field.symbolRef) {
      return;
    }

    workspace.requestAutocomplete(inputId, field.symbolRef);
  }
</script>

<FieldPanel
  title={field.label}
  typeLabel={field.typeLabel}
  description={panelDescription}
  infoItems={field.infoItems}
  issues={field.issues}
>
  {#if field.valueMode === "compute"}
    <ComputeAutocompleteInput
      inputId={inputId}
      initialValue={draftValue}
      data-vscode-context={"{}"}
      placeholder="Type for suggestions"
      autocompleteOptions={computeAutocompleteOptions}
      inputClass="w-full rounded-md border border-vsc-border px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100 bg-vsc-input-bg"
      listClass="absolute left-0 right-0 top-full z-[160] max-h-56 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
      optionClass="block w-full cursor-pointer border border-transparent px-3 py-2 text-left text-vsc-input-fg hover:bg-vsc-list-hover"
      oncommit={value => {
        draftValue = value;
        workspace.updateFieldComputeExpression(field.fieldPath, value);
      }}
    />
  {:else if field.type === "number"}
    <input
      id={inputId}
      type="text"
      data-vscode-context={"{}"}
      class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
      bind:value={draftValue}
      placeholder="Unset"
      inputmode="decimal"
      oninput={event => {
        draftValue = sanitizeNumber(event.currentTarget.value);
      }}
      onblur={commitNumberValue}
      onkeydown={event => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          commitNumberValue();
          event.currentTarget.blur();
        }
      }}
    />
  {:else}
    <SingleLineAutocompleteInput
      {inputId}
      initialValue={draftValue}
      data-vscode-context={"{}"}
      placeholder="Unset"
      autocompleteOptions={autocompleteOptions}
      inputClass="w-full rounded-md border border-vsc-border px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100 bg-vsc-input-bg"
      listClass="absolute left-0 right-0 top-full z-[160] max-h-40 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
      optionClass="block w-full cursor-pointer px-3 py-2 text-left text-sm text-vsc-input-fg hover:bg-vsc-list-hover"
      previewClass="z-[160]"
      onfocus={requestAutocomplete}
      oncommit={value => {
        draftValue = value;
        workspace.updateFieldValue(field.fieldPath, value);
      }}
      afterEnterPressed={input => input.blur()}
    />
  {/if}
</FieldPanel>
