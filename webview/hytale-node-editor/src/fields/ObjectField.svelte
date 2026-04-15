<script lang="ts">
  import { type NodeField } from "@shared/node-editor/workspaceTypes";
  import FieldEditor from "@node-editor/fields/FieldEditor.svelte";
  import FieldLayout from "@node-editor/fields/FieldLayout.svelte";
  import { type FieldProps } from "@node-editor/node-editor/utils/fieldUtils";
  import type { Snippet } from "svelte";

  let {
    nodeId,
    inputId,
    label,
    description,
    initialValue,
    inputWidth,
    onconfirm,
    schemaKey,
    subfields,
    parentSchemaKey,
    titleActions,
  }: FieldProps<object> & {
    subfields: NodeField[];
    nodeId: string;
    schemaKey: string;
    parentSchemaKey?: string;
    titleActions?: Snippet;
  } = $props();

  let value = $derived<object>(initialValue ? structuredClone($state.snapshot(initialValue)) : {});
  let lastCommittedValue = $derived<object>(
    initialValue ? structuredClone($state.snapshot(initialValue)) : {},
  );

  function confirmValue(schemaKey: string, childValue: unknown) {
    value[schemaKey] = childValue;
    if (JSON.stringify(value) !== JSON.stringify(lastCommittedValue)) {
      lastCommittedValue = structuredClone($state.snapshot(value));
      onconfirm(lastCommittedValue);
    }
  }

  let newParentSchemaKey = $derived(
    parentSchemaKey ? parentSchemaKey + "-" + schemaKey : schemaKey,
  );
</script>

<FieldLayout {inputId} {label} {description} align="start" {titleActions}>
  <div
    id={inputId}
    class="flex flex-col gap-1.5 rounded-md border border-dashed border-vsc-editor-widget-border p-2"
    class:w-full={inputWidth === undefined}
    style:width={inputWidth !== undefined ? `${inputWidth}px` : undefined}
  >
    <div class="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5">
      {#each subfields as field}
        <FieldEditor
          {nodeId}
          parentSchemaKey={newParentSchemaKey}
          {...field}
          value={value[field.schemaKey]}
          onconfirm={value => confirmValue(field.schemaKey, value)}
        />
      {/each}
    </div>
  </div>
</FieldLayout>
