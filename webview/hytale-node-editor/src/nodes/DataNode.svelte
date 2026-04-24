<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { type DataNodeType } from "@node-editor/common";
  import { createNodePropertiesUpdatedEdit } from "@node-editor/node-editor/utils/graphDocument";
  import { useNodeEditorSession } from "@node-editor/workspace.svelte";
  import FieldEditor from "../fields/FieldEditor.svelte";
  import BaseNode from "./BaseNode.svelte";
  import ComponentReferenceNodeBody from "./ComponentReferenceNodeBody.svelte";

  const { id, ...props }: DataNodeType = $props();
  const fieldsBySchemaKey = $derived(props.data.fieldsBySchemaKey);
  const { updateNodeData } = useSvelteFlow();
  const workspace = useNodeEditorSession();

  function updateField(
    schemaKey: string,
    nextValue: unknown,
    options: { isImplicit?: boolean; isSet?: boolean } = {},
  ) {
    const previousField = fieldsBySchemaKey[schemaKey];
    const previousValue = previousField?.value;
    const previousIsImplicit = previousField?.isImplicit;
    const previousIsSet = previousField?.isSet ?? false;
    const nextIsImplicit = options.isImplicit ?? false;
    const nextIsSet = options.isSet ?? true;
    updateNodeData(id, {
      fieldsBySchemaKey: {
        ...fieldsBySchemaKey,
        [schemaKey]: {
          ...fieldsBySchemaKey[schemaKey],
          value: nextValue,
          isImplicit: nextIsImplicit,
          isSet: nextIsSet,
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
        afterIsImplicit: nextIsImplicit,
        beforeIsSet: previousIsSet,
        afterIsSet: nextIsSet,
      },
    ]);
    if (edit) {
      workspace.applyGraphEdit(edit);
    }
  }
</script>

<BaseNode {id} {...props}>
  {#if props.data.isComponentReference}
    <ComponentReferenceNodeBody
      nodeId={id}
      {fieldsBySchemaKey}
    />
  {:else}
    <div class="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
      {#each Object.entries(fieldsBySchemaKey) as [schemaKey, field] (schemaKey)}
        <FieldEditor nodeId={id} {...field} onconfirm={value => updateField(schemaKey, value)} />
      {/each}
    </div>
  {/if}
</BaseNode>
