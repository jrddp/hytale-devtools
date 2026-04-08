<script lang="ts">
  import { getNpcFieldTypeLabel, type NpcPropertyField } from "../../propertyModel";
  import { workspace } from "../../workspace.svelte";
  import FieldComputeToggleButton from "../FieldComputeToggleButton.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: NpcPropertyField } = $props();

  let draftValue = $state("");

  $effect(() => {
    draftValue = JSON.stringify(
      field.value.kind === "literal" ? field.value.value : { Compute: field.value.expression },
      null,
      2,
    );
  });

  const fieldVscodeContext = $derived(workspace.buildFieldVscodeContext(field.fieldPath));
  const issues = $derived(workspace.getFieldIssues(field.fieldPath));

  function commitRawJsonValue() {
    try {
      workspace.updateFieldValue(field.fieldPath, JSON.parse(draftValue));
    } catch {
      draftValue = JSON.stringify(
        field.value.kind === "literal" ? field.value.value : { Compute: field.value.expression },
        null,
        2,
      );
    }
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
  <textarea
    data-vscode-context={"{}"}
    class="min-h-28 w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
    bind:value={draftValue}
    placeholder={"{ ... }"}
    onblur={commitRawJsonValue}
    onkeydown={event => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        commitRawJsonValue();
        event.currentTarget.blur();
      }
    }}
  ></textarea>
</FieldPanel>
