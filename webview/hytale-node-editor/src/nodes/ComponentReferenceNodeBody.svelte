<script lang="ts">
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import {
    createComponentReferenceExportStatesFieldSchemaKey,
    createComponentReferenceInterfaceParametersFieldSchemaKey,
    createComponentReferenceModifyMapFieldSchemaKey,
    parseComponentReferenceSyntheticFieldSchemaKey,
  } from "@shared/node-editor/componentReferences";
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
  const isComputedReference = $derived(isComputeReferenceValue(referenceField?.value));
  const showComputedReferenceBody = $derived(isComputedReference);
  const hasReferenceValue = $derived(
    typeof referenceField?.value === "string"
      ? referenceField.value.trim().length > 0
      : isComputeReferenceValue(referenceField?.value)
        ? referenceField.value.Compute.trim().length > 0
        : false,
  );
  const nullableField = $derived(
    fieldsBySchemaKey.Nullable ?? createNullableField(),
  );
  const interfacesField = $derived(
    fieldsBySchemaKey.Interfaces ?? createInterfacesField(),
  );
  const computedInterfaceValues = $derived.by(() => {
    if (!Array.isArray(interfacesField?.value)) {
      return [];
    }

    const interfaceKeys: string[] = [];
    for (const value of interfacesField.value) {
      if (typeof value !== "string") {
        continue;
      }
      const interfaceKey = value.trim();
      if (!interfaceKey || interfaceKeys.includes(interfaceKey)) {
        continue;
      }
      interfaceKeys.push(interfaceKey);
    }
    return interfaceKeys;
  });
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
  const computedExportStatesField = $derived.by(() =>
    Object.entries(fieldsBySchemaKey).find(([schemaKey]) => {
      const syntheticField = parseComponentReferenceSyntheticFieldSchemaKey(schemaKey);
      return syntheticField?.kind === "export-states";
    }) ?? [
      createComponentReferenceExportStatesFieldSchemaKey(),
      createExportStatesField(),
    ] satisfies [string, NodeField],
  );
  const computedParametersField = $derived.by(() =>
    Object.entries(fieldsBySchemaKey).find(([schemaKey]) => {
      const syntheticField = parseComponentReferenceSyntheticFieldSchemaKey(schemaKey);
      return syntheticField?.kind === "modify-map";
    }) ?? [
      createComponentReferenceModifyMapFieldSchemaKey(),
      createParametersField(),
    ] satisfies [string, NodeField],
  );
  const interfaceParameterFields = $derived.by(() =>
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
          syntheticField: { kind: "interface-parameters"; interfaceKey: string };
        } => entry.syntheticField?.kind === "interface-parameters",
      )
      .sort((left, right) =>
        left.syntheticField.interfaceKey.localeCompare(right.syntheticField.interfaceKey),
      ),
  );
  const missingInterfaceParameterFields = $derived(
    computedInterfaceValues.filter(
      interfaceKey =>
        !interfaceParameterFields.some(
          entry => entry.syntheticField.interfaceKey === interfaceKey,
        ),
    ),
  );

  function updateField(
    schemaKey: string,
    nextValue: unknown,
    options: { isImplicit?: boolean; isSet?: boolean } = {},
  ) {
    const previousField = fieldsBySchemaKey[schemaKey] ?? createFallbackField(schemaKey);
    if (!previousField) {
      return;
    }

    const previousValue = previousField?.value;
    const previousIsImplicit = previousField?.isImplicit;
    const previousIsSet = previousField?.isSet ?? false;
    const nextIsImplicit = options.isImplicit ?? false;
    const nextIsSet = options.isSet ?? true;
    updateNodeData(nodeId, {
      fieldsBySchemaKey: {
        ...fieldsBySchemaKey,
        [schemaKey]: {
          ...previousField,
          value: nextValue,
          isImplicit: nextIsImplicit,
          isSet: nextIsSet,
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
        beforeIsSet: previousIsSet,
        afterIsSet: nextIsSet,
      },
    ]);
    if (edit) {
      workspace.applyGraphEdit(edit);
    }
  }

  function createFallbackField(schemaKey: string): NodeField | null {
    if (schemaKey === "Nullable") {
      return createNullableField();
    }
    if (schemaKey === "Interfaces") {
      return createInterfacesField();
    }
    if (schemaKey === createComponentReferenceExportStatesFieldSchemaKey()) {
      return createExportStatesField();
    }
    if (schemaKey === createComponentReferenceModifyMapFieldSchemaKey()) {
      return createParametersField();
    }

    const syntheticField = parseComponentReferenceSyntheticFieldSchemaKey(schemaKey);
    if (syntheticField?.kind === "interface-parameters") {
      return createInterfaceParametersField(syntheticField.interfaceKey);
    }

    return null;
  }

  function createNullableField(): NodeField {
    return {
      schemaKey: "Nullable",
      localId: "Nullable",
      type: "checkbox",
      label: "Nullable",
      description: "Allow the computed reference to resolve to no component.",
      value: false,
      isImplicit: true,
      isSet: false,
    };
  }

  function createInterfacesField(): NodeField {
    return {
      schemaKey: "Interfaces",
      localId: "Interfaces",
      type: "list",
      label: "Interfaces",
      description: "Allowed component interface codes for a computed reference.",
      value: [],
      isImplicit: true,
      isSet: false,
      symbolLookup: {
        indexKind: "assetDerived",
        key: "npcComponentInterfaces",
      },
    };
  }

  function createExportStatesField(): NodeField {
    const schemaKey = createComponentReferenceExportStatesFieldSchemaKey();
    return {
      schemaKey,
      localId: schemaKey,
      type: "list",
      label: "Export States",
      description: "Ordered states exported to the resolved component's imported states.",
      value: [],
      isImplicit: true,
      isSet: false,
    };
  }

  function createParametersField(): NodeField {
    const schemaKey = createComponentReferenceModifyMapFieldSchemaKey();
    return {
      schemaKey,
      localId: schemaKey,
      type: "parameterMap",
      label: "Parameters",
      value: {},
      isImplicit: true,
      isSet: false,
      parameterMapKeySymbolLookup: {
        indexKind: "assetDerived",
        key: "npcInterfaceParameters",
      },
    };
  }

  function createInterfaceParametersField(interfaceKey: string): NodeField {
    const schemaKey = createComponentReferenceInterfaceParametersFieldSchemaKey(interfaceKey);
    return {
      schemaKey,
      localId: schemaKey,
      type: "parameterMap",
      label: `${interfaceKey} Parameters`,
      value: {},
      isImplicit: false,
      isSet: true,
      parameterMapKeySymbolLookup: {
        indexKind: "assetDerived",
        key: "npcInterfaceParameters",
        filter: {
          npcComponentInterfaces: [interfaceKey],
        },
      },
    };
  }

  function isComputeReferenceValue(value: unknown): value is { Compute: string } {
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Object.keys(value).length === 1 &&
      typeof (value as { Compute?: unknown }).Compute === "string"
    );
  }

  function addInterfaceParametersSection(interfaceKey: string) {
    const schemaKey = createComponentReferenceInterfaceParametersFieldSchemaKey(interfaceKey);
    if (fieldsBySchemaKey[schemaKey]) {
      return;
    }

    updateNodeData(nodeId, {
      fieldsBySchemaKey: {
        ...fieldsBySchemaKey,
        [schemaKey]: createInterfaceParametersField(interfaceKey),
      },
    });
  }
</script>

<div class="flex min-w-[20rem] flex-col gap-3">
  {#if referenceField}
    <div class="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
      <FieldEditor nodeId={nodeId} {...referenceField} onconfirm={value => updateField("Reference", value)} />
    </div>
  {/if}

  {#if showComputedReferenceBody}
    {#if nullableField || interfacesField}
      <div class="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
        {#if nullableField}
          <FieldEditor nodeId={nodeId} {...nullableField} onconfirm={value => updateField("Nullable", value)} />
        {/if}
        {#if interfacesField}
          <FieldEditor nodeId={nodeId} {...interfacesField} onconfirm={value => updateField("Interfaces", value)} />
        {/if}
      </div>
    {/if}

    {#if computedExportStatesField}
      <div class="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
        <FieldEditor
          nodeId={nodeId}
          {...computedExportStatesField[1]}
          onconfirm={value => updateField(computedExportStatesField[0], value)}
        />
      </div>
    {/if}

    {#if computedParametersField}
      <FieldEditor
        nodeId={nodeId}
        {...computedParametersField[1]}
        onconfirm={value => updateField(computedParametersField[0], value)}
      />
    {/if}

    {#each interfaceParameterFields as { schemaKey, field } (schemaKey)}
      <FieldEditor nodeId={nodeId} {...field} onconfirm={value => updateField(schemaKey, value)} />
    {/each}

    {#if missingInterfaceParameterFields.length > 0}
      <div class="flex flex-col gap-1 border-t border-vsc-editor-widget-border pt-2">
        {#each missingInterfaceParameterFields as interfaceKey (interfaceKey)}
          <button
            type="button"
            class="rounded-md border border-dashed border-vsc-button-border px-2 py-1 text-left text-xs text-vsc-muted hover:bg-vsc-list-hover hover:text-vsc-input-fg"
            onclick={() => addInterfaceParametersSection(interfaceKey)}
          >
            Add {interfaceKey} Parameters
          </button>
        {/each}
      </div>
    {/if}
  {:else if hasReferenceValue && exportStateFields.length > 0}
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

  {#if hasReferenceValue && !isComputedReference && overrideFields.length > 0}
    <div class="space-y-1">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-vsc-muted">Parameters</div>
      <div class="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
        {#each overrideFields as { schemaKey, field } (schemaKey)}
          <FieldEditor nodeId={nodeId} {...field} onconfirm={value => updateField(schemaKey, value)} />
        {/each}
      </div>
    </div>
  {/if}
</div>
