<script lang="ts">
  import ComputeAutocompleteInput from "@webview-shared/components/ComputeAutocompleteInput.svelte";
  import { buildNpcComputeAutocompleteOptions } from "../../compute/computeAutocomplete";
  import { getNpcFieldTypeLabel, type NpcPropertyField } from "../../propertyModel";
  import { workspace } from "../../workspace.svelte";
  import FieldComputeToggleButton from "../FieldComputeToggleButton.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: NpcPropertyField } = $props();

  let checked = $state(false);
  let draftValue = $state("");

  $effect(() => {
    checked = field.value.kind === "literal" && field.value.value === true;
    draftValue = field.value.kind === "compute" ? field.value.expression : "";
  });

  const fieldVscodeContext = $derived(
    workspace.buildFieldVscodeContext(field.fieldPath, {
      canDeleteField: field.canUnset !== false && field.isSet !== false,
    }),
  );
  const issues = $derived(workspace.getFieldIssues(field.fieldPath));
  const computeAutocompleteOptions = $derived(
    buildNpcComputeAutocompleteOptions({
      parameters: workspace.getStandardParameterFields(),
      scope: "standard",
    }),
  );
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
      inputId={`npc-property-${field.id}`}
      initialValue={draftValue}
      data-vscode-context={"{}"}
      placeholder="Type for suggestions"
      autocompleteOptions={computeAutocompleteOptions}
      inputClass="w-full rounded-md border border-vsc-border px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100 bg-vsc-input-bg"
      listClass="absolute left-0 right-0 top-full z-[160] max-h-56 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
      optionClass="block w-full cursor-pointer border border-transparent px-3 py-2 text-left text-vsc-input-fg hover:bg-vsc-list-hover"
      oncommit={value => workspace.updateFieldComputeExpression(field.fieldPath, value)}
    />
  {:else}
    <div class="inline-flex">
      <input
        class="size-6 accent-vsc-activity-bar-badge-bg"
        type="checkbox"
        data-vscode-context={"{}"}
        bind:checked
        onchange={event => workspace.updateFieldValue(field.fieldPath, event.currentTarget.checked)}
      />
    </div>
  {/if}
</FieldPanel>
