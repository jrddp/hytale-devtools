<script lang="ts">
  import ComputeAutocompleteInput from "@webview-shared/components/ComputeAutocompleteInput.svelte";
  import SingleLineAutocompleteInput from "@webview-shared/components/SingleLineAutocompleteInput.svelte";
  import { buildNpcComputeAutocompleteOptions } from "../../compute/computeAutocomplete";
  import { getNpcFieldTypeLabel, type NpcPropertyField } from "../../propertyModel";
  import { workspace } from "../../workspace.svelte";
  import FieldComputeToggleButton from "../FieldComputeToggleButton.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: NpcPropertyField } = $props();

  let draftValue = $state("");

  $effect(() => {
    const currentValue =
      field.value.kind === "compute" ? field.value.expression : String(field.value.value ?? "");
    draftValue = currentValue;
  });

  const inputId = $derived(`npc-property-${field.id}`);
  const fieldVscodeContext = $derived(
    workspace.buildFieldVscodeContext(field.fieldPath, {
      canDeleteField: field.canUnset !== false && field.isSet !== false,
    }),
  );
  const issues = $derived(workspace.getFieldIssues(field.fieldPath));
  const hasComputeIssues = $derived(
    issues.some(issue => issue.code.startsWith("compute-")),
  );
  const computeInputStyle = $derived(
    hasComputeIssues
      ? "border-color: var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));"
      : undefined,
  );
  const autocompleteOptions = $derived(
    (field.staticSuggestions?.length
      ? field.staticSuggestions.map(value => ({ value }))
      : field.symbolRef && workspace.autocompleteField === inputId
        ? workspace.autocompleteValues.map(value => ({ value }))
        : []
    ),
  );
  const computeAutocompleteOptions = $derived(
    buildNpcComputeAutocompleteOptions({
      parameters: workspace.getStandardParameterFields(),
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
      workspace.updateFieldValue(field.fieldPath, 0);
      return;
    }

    const nextValue = Number(sanitized);
    if (Number.isNaN(nextValue)) {
      draftValue =
        field.value.kind === "literal" && typeof field.value.value === "number"
          ? String(field.value.value)
          : "";
      return;
    }

    workspace.updateFieldValue(field.fieldPath, nextValue);
  }

  function requestAutocomplete() {
    if (field.staticSuggestions?.length || !field.symbolRef) {
      return;
    }

    workspace.requestAutocomplete(inputId, field.symbolRef);
  }
</script>

{#snippet computeToggle()}
  {#if field.computable && field.canChangeType === false}
    <FieldComputeToggleButton
      enabled
      active={field.value.kind === "compute"}
      ontoggle={() => workspace.toggleFieldComputeMode(field.fieldPath)}
    />
  {/if}
{/snippet}

<FieldPanel
  title={field.label}
  typeLabel={getNpcFieldTypeLabel(field)}
  description={field.description}
  issues={issues}
  titleActions={computeToggle}
  vscodeContext={fieldVscodeContext}
  onunset={field.canUnset !== false && field.isSet !== false
    ? () => {
        workspace.unsetField(field.fieldPath);
      }
    : undefined}
>
  {#if field.value.kind === "compute"}
    <ComputeAutocompleteInput
      inputId={inputId}
      initialValue={draftValue}
      data-vscode-context={"{}"}
      style={computeInputStyle}
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
  {:else if field.kind === "number"}
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
