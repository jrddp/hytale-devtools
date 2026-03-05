<script lang="ts">
  import { type NodeField } from "@shared/node-editor/workspaceTypes";
  import FieldEditor from "src/fields/FieldEditor.svelte";
  import { type FieldProps } from "src/node-editor/utils/fieldUtils";

  let {
    nodeId,
    inputId,
    label,
    initialValue,
    onconfirm,
    schemaKey,
    subfields,
    parentSchemaKey,
  }: FieldProps<object> & {
    subfields: NodeField[];
    nodeId: string;
    schemaKey: string;
    parentSchemaKey?: string;
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

<div
  id={inputId}
  class="flex flex-col gap-1.5 rounded-md border border-dashed border-vsc-editor-widget-border p-2"
>
  <div class="text-xs font-bold uppercase text-vsc-muted">{label}</div>
  <div class="flex flex-col gap-1.5">
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
