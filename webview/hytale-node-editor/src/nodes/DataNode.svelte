<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { type DataNodeType } from "src/common";
  import { applyDocumentState } from "src/workspace.svelte";
  import FieldEditor from "../fields/FieldEditor.svelte";
  import BaseNode from "./BaseNode.svelte";

  const { id, ...props }: DataNodeType = $props();
  const fieldsBySchemaKey = $derived(props.data.fieldsBySchemaKey);
  const { updateNodeData } = useSvelteFlow();

  function updateField(schemaKey: string, nextValue: unknown) {
    updateNodeData(id, {
      fieldsBySchemaKey: {
        ...fieldsBySchemaKey,
        [schemaKey]: {
          ...fieldsBySchemaKey[schemaKey],
          value: nextValue,
        },
      },
    });
    applyDocumentState("custom-field-updated");
  }
</script>

<BaseNode {id} {...props}>
  <div class="flex flex-col gap-2">
    {#each Object.entries(fieldsBySchemaKey) as [schemaKey, field]}
      <FieldEditor nodeId={id} {...field} onvalidate={value => updateField(schemaKey, value)} />
    {/each}
  </div>
</BaseNode>
