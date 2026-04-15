<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { type DataNodeType } from "@node-editor/common";
  import { createNodePropertiesUpdatedEdit } from "@node-editor/node-editor/utils/graphDocument";
  import { useNodeEditorSession } from "@node-editor/workspace.svelte";
  import FieldEditor from "../fields/FieldEditor.svelte";
  import BaseNode from "./BaseNode.svelte";

  const { id, ...props }: DataNodeType = $props();
  const fieldsBySchemaKey = $derived(props.data.fieldsBySchemaKey);
  const { updateNodeData } = useSvelteFlow();
  const workspace = useNodeEditorSession();

  function updateField(schemaKey: string, nextValue: unknown) {
    const previousField = fieldsBySchemaKey[schemaKey];
    const previousValue = previousField?.value;
    const previousIsImplicit = previousField?.isImplicit;
    updateNodeData(id, {
      fieldsBySchemaKey: {
        ...fieldsBySchemaKey,
        [schemaKey]: {
          ...fieldsBySchemaKey[schemaKey],
          value: nextValue,
          isImplicit: false,
        },
      },
    });
    const edit = createNodePropertiesUpdatedEdit([
      {
        type: "field-value",
        nodeId: id,
        schemaKey,
        beforeValue: previousValue,
        afterValue: nextValue,
        beforeIsImplicit: previousIsImplicit,
        afterIsImplicit: false,
      },
    ]);
    if (edit) {
      workspace.applyGraphEdit(edit);
    }
  }
</script>

<BaseNode {id} {...props}>
  <div class="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
    {#each Object.entries(fieldsBySchemaKey) as [schemaKey, field] (schemaKey)}
      <FieldEditor nodeId={id} {...field} onconfirm={value => updateField(schemaKey, value)} />
    {/each}
  </div>
</BaseNode>
