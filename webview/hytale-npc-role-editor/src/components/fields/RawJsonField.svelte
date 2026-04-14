<script lang="ts">
  import type { Snippet } from "svelte";
  import { getNpcFieldTypeLabel, type NpcPropertyField } from "../../propertyModel";
  import { workspace } from "../../workspace.svelte";
  import FieldComputeToggleButton from "../FieldComputeToggleButton.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  let {
    field,
    root = false,
    handle,
  }: {
    field: NpcPropertyField;
    root?: boolean;
    handle?: Snippet;
  } = $props();

  let draftValue = $state("");

  $effect(() => {
    draftValue = JSON.stringify(
      field.value.kind === "literal" ? field.value.value : { Compute: field.value.expression },
      null,
      2,
    );
  });

  const fieldVscodeContext = $derived(
    workspace.buildFieldVscodeContext(field.fieldPath, {
      canDeleteField: field.canUnset !== false && field.isSet !== false,
    }),
  );
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

{#snippet editor()}
  {#if field.kind === "graph" && field.rootType}
    <div class="rounded-md border border-dashed border-vsc-border px-3 py-2 text-sm text-vsc-muted opacity-80">
      Embedded {field.rootType} graph editing is deferred in this slice. The underlying JSON remains editable here.
    </div>
  {/if}

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
{/snippet}

{#if root}
  <div class="space-y-3">
    {@render editor()}
  </div>
{:else}
  <FieldPanel
    title={field.label}
    typeLabel={getNpcFieldTypeLabel(field)}
    description={field.description}
    issues={issues}
    titleActions={computeToggle}
    {handle}
    vscodeContext={fieldVscodeContext}
    onunset={field.canUnset !== false && field.isSet !== false
      ? () => {
          workspace.unsetField(field.fieldPath);
        }
      : undefined}
  >
    {@render editor()}
  </FieldPanel>
{/if}
