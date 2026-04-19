<script lang="ts">
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import { parseComponentReferenceSyntheticFieldSchemaKey } from "@shared/node-editor/componentReferences";
  import { useSvelteFlow } from "@xyflow/svelte";
  import { createNodePropertiesUpdatedEdit } from "@node-editor/node-editor/utils/graphDocument";
  import { useNodeEditorSession } from "@node-editor/workspace.svelte";
  import FieldEditor from "../fields/FieldEditor.svelte";

  const {
    nodeId,
    fieldsBySchemaKey,
  }: {
    nodeId: string;
    fieldsBySchemaKey: Record<string, NodeField>;
  } = $props();

  const { updateNodeData } = useSvelteFlow();
  const workspace = useNodeEditorSession();

  const referenceField = $derived(fieldsBySchemaKey.Reference);
  const hasReferenceValue = $derived(
    typeof referenceField?.value === "string" ? referenceField.value.trim().length > 0 : false,
  );
  const exportStateFields = $derived.by(() =>
    Object.entries(fieldsBySchemaKey)
      .map(([schemaKey, field]) => ({
        schemaKey,
        field,
        syntheticField: parseComponentReferenceSyntheticFieldSchemaKey(schemaKey),
      }))
      .filter(
        (
          entry,
        ): entry is {
          schemaKey: string;
          field: NodeField;
          syntheticField: { kind: "export-state"; index: number };
        } => entry.syntheticField?.kind === "export-state",
      )
      .sort((left, right) => left.syntheticField.index - right.syntheticField.index),
  );
  const overrideFields = $derived.by(() =>
    Object.entries(fieldsBySchemaKey)
      .map(([schemaKey, field]) => ({
        schemaKey,
        field,
        syntheticField: parseComponentReferenceSyntheticFieldSchemaKey(schemaKey),
      }))
      .filter(
        (
          entry,
        ): entry is {
          schemaKey: string;
          field: NodeField;
          syntheticField: { kind: "modify"; key: string };
        } => entry.syntheticField?.kind === "modify",
      ),
  );

  function updateField(schemaKey: string, nextValue: unknown, nextIsImplicit = false) {
    const previousField = fieldsBySchemaKey[schemaKey];
    const previousValue = previousField?.value;
    const previousIsImplicit = previousField?.isImplicit;
    updateNodeData(nodeId, {
      fieldsBySchemaKey: {
        ...fieldsBySchemaKey,
        [schemaKey]: {
          ...fieldsBySchemaKey[schemaKey],
          value: nextValue,
          isImplicit: nextIsImplicit,
        },
      },
    });
    const edit = createNodePropertiesUpdatedEdit([
      {
        type: "field-value",
        nodeId,
        schemaKey,
        beforeValue: previousValue,
        afterValue: nextValue,
        beforeIsImplicit: previousIsImplicit,
        afterIsImplicit: nextIsImplicit,
      },
    ]);
    if (edit) {
      workspace.applyGraphEdit(edit);
    }
  }
</script>

<div class="flex min-w-[20rem] flex-col gap-3">
  {#if referenceField}
    <div class="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
      <FieldEditor nodeId={nodeId} {...referenceField} onconfirm={value => updateField("Reference", value)} />
    </div>
  {/if}

  {#if hasReferenceValue && exportStateFields.length > 0}
    <div class="space-y-1">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-vsc-muted">
        Export States
      </div>
      <div class="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
        {#each exportStateFields as { schemaKey, field } (schemaKey)}
          <FieldEditor nodeId={nodeId} {...field} onconfirm={value => updateField(schemaKey, value)} />
        {/each}
      </div>
    </div>
  {/if}

  {#if hasReferenceValue && overrideFields.length > 0}
    <div class="space-y-1">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-vsc-muted">Modify</div>
      <div class="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
        {#each overrideFields as { schemaKey, field } (schemaKey)}
          <FieldEditor nodeId={nodeId} {...field} onconfirm={value => updateField(schemaKey, value)} />
        {/each}
      </div>
    </div>
  {/if}
</div>
