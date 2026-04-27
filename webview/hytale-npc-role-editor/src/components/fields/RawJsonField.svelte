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
    notice,
  }: {
    field: NpcPropertyField;
    root?: boolean;
    handle?: Snippet;
    notice?: string;
  } = $props();

  let draftValue = $state("");
  let collapsed = $state(false);

  $effect(() => {
    draftValue = JSON.stringify(
      field.value.kind === "literal" ? field.value.value : { Compute: field.value.expression },
      null,
      2,
    );
  });

  $effect(() => {
    collapsed = field.ui?.collapsed ?? false;
  });

  $effect(() => {
    if (!field.ui) {
      field.ui = {};
    }

    field.ui.collapsed = collapsed;
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
  {#if notice}
    <div class="rounded-md border border-dashed border-vsc-border px-3 py-2 text-sm text-vsc-muted opacity-80">
      {notice}
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
    required={field.required === true}
    description={field.description}
    issues={issues}
    titleActions={computeToggle}
    {handle}
    vscodeContext={fieldVscodeContext}
    collapseStateKey={field.fieldPath}
    bind:collapsed
    onunset={field.canUnset !== false && field.isSet !== false
      ? () => {
          workspace.unsetField(field.fieldPath);
        }
      : undefined}
  >
    {@render editor()}
  </FieldPanel>
{/if}
