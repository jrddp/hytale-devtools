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

  let value = $derived<Record<string, unknown>>(
    initialValue ? structuredClone($state.snapshot(initialValue)) as Record<string, unknown> : {},
  );
  let lastCommittedValue = $derived<Record<string, unknown>>(
    initialValue ? structuredClone($state.snapshot(initialValue)) as Record<string, unknown> : {},
  );

  function confirmChildValue(
    childSchemaKey: string,
    childValue: unknown,
    options?: { isImplicit?: boolean; isSet?: boolean },
  ) {
    if (options?.isSet === false) {
      delete value[childSchemaKey];
    } else {
      value[childSchemaKey] = childValue;
    }

    if (JSON.stringify(value) !== JSON.stringify(lastCommittedValue)) {
      lastCommittedValue = structuredClone($state.snapshot(value));
      onconfirm(lastCommittedValue);
    }
  }

  let newParentSchemaKey = $derived(
    parentSchemaKey ? parentSchemaKey + "-" + schemaKey : schemaKey,
  );

  function getChildSchemaKey(field: NodeField): string {
    return field.schemaKey ?? field.localId;
  }

  function hasChildValue(field: NodeField): boolean {
    return Object.hasOwn(value, getChildSchemaKey(field));
  }

  function getChildValue(field: NodeField): unknown {
    const childSchemaKey = getChildSchemaKey(field);
    return hasChildValue(field) ? value[childSchemaKey] : field.value;
  }
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
          value={getChildValue(field)}
          isSet={hasChildValue(field)}
          onconfirm={(childValue, options) => confirmChildValue(getChildSchemaKey(field), childValue, options)}
        />
      {/each}
    </div>
  </div>
</FieldLayout>
