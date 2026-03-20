<script lang="ts">
  import { Plus, Redo2 } from "lucide-svelte";
  import type { RenderFieldProps } from "src/common";
  import FieldRenderer from "src/components/FieldRenderer.svelte";
  import { isFieldSet } from "src/components/fieldHelpers";
  import type {
    FieldInstance,
    MapFieldInstance,
    StringFieldInstance,
  } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import StringField from "./StringField.svelte";

  let {
    field,
    depth = 0,
    readOnly = false,
    readOnlyMessage,
    fieldPanelOverrides,
  }: RenderFieldProps<MapFieldInstance> = $props();
  const hasInheritedOnlyEntries = $derived(
    field.entries.length === 0 && field.inheritedEntries.length > 0,
  );
  const visibleEntries = $derived(hasInheritedOnlyEntries ? field.inheritedEntries : field.entries);
  const entriesReadOnly = $derived(readOnly || hasInheritedOnlyEntries);
  const childReadOnlyMessage = $derived(
    hasInheritedOnlyEntries
      ? `Inherited by ${field.schemaKey ?? "parent"}.\nOverride to edit.`
      : readOnlyMessage,
  );
  const summary = $derived(
    hasInheritedOnlyEntries
      ? `${visibleEntries.length} inherited entries`
      : `${visibleEntries.length} map entries`,
  );
  const entryKeyFields = new WeakMap<FieldInstance, StringFieldInstance>();

  function addEntry() {
    const key = `Entry ${field.entries.length + 1}`;
    const valueField = workspace.createEmptyFieldInstance(field.valueField);
    valueField.schemaKey = key;

    field.entries = [
      ...field.entries,
      {
        key,
        valueField,
      },
    ];
    workspace.applyDocumentState();
  }

  function overrideParentValue() {
    if (!hasInheritedOnlyEntries) {
      return;
    }

    field.entries = structuredClone($state.snapshot(field.inheritedEntries)) as {
      key: string;
      valueField: FieldInstance;
    }[];
    workspace.applyDocumentState();
  }

  function removeEntry(index: number) {
    field.entries.splice(index, 1);
    workspace.applyDocumentState();
  }

  function commitEntryKey(nextKey: string, index: number) {
    const normalizedKey = nextKey.trim();
    if (!normalizedKey) {
      return false;
    }

    if (field.entries[index]?.key === normalizedKey) {
      return;
    }

    field.entries[index].key = normalizedKey;
    field.entries[index].valueField.schemaKey = normalizedKey;

    // TODO FIXME we should be persisting empty map entries since we want to ensure we persist their keys
    if (isFieldSet(field.entries[index]?.valueField)) {
      workspace.applyDocumentState();
    }

    return true;
  }

  function getEntryKeyField(entry: { key: string; valueField: FieldInstance }) {
    let entryKeyField = entryKeyFields.get(entry.valueField);
    if (!entryKeyField) {
      entryKeyField = workspace.createEmptyFieldInstance(field.keyField);
      entryKeyFields.set(entry.valueField, entryKeyField);
    }

    entryKeyField.value = entry.key;
    return entryKeyField;
  }
</script>

<FieldPanel
  {field}
  {depth}
  {readOnly}
  {fieldPanelOverrides}
  {summary}
  childReadOnly={hasInheritedOnlyEntries}
  collapsedByDefault={false}
>
  {#if hasInheritedOnlyEntries && !readOnly}
    <button
      type="button"
      class="rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg hover:bg-vsc-button-hover w-full flex items-center gap-1"
      onclick={overrideParentValue}
    >
      <Redo2 size={14} />
      Override Parent
    </button>
  {/if}

  {#if visibleEntries.length === 0}
    <div class="px-3 py-2 border border-dashed rounded-md border-vsc-border opacity-65">
      No entries
    </div>
  {/if}

  {#each visibleEntries as entry, index (`${entry.key}-${entry.valueField.schemaKey ?? entry.valueField.type}-${index}`)}
    {@const entryKeyField = getEntryKeyField(entry)}
    {#snippet entryTitle()}
      <StringField
        field={entryKeyField}
        depth={depth + 1}
        readOnly={entriesReadOnly}
        readOnlyMessage={childReadOnlyMessage}
        applyDocumentStateOnCommit={false}
        fieldPanelOverrides={{ minimal: true }}
        oncommitchange={nextKey => commitEntryKey(nextKey ?? "", index)}
      />
    {/snippet}
    <FieldRenderer
      field={entry.valueField}
      depth={depth + 1}
      readOnly={entriesReadOnly}
      readOnlyMessage={childReadOnlyMessage}
      fieldPanelOverrides={{
        title: entryTitle,
      }}
      onunset={!entriesReadOnly ? () => removeEntry(index) : undefined}
    />
  {/each}

  {#if !readOnly && !hasInheritedOnlyEntries}
    <button
      type="button"
      class="rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg hover:bg-vsc-button-hover w-full opacity-80 flex items-center gap-1"
      onclick={addEntry}
    >
      <Plus size={14} />
      Add Entry
    </button>
  {/if}
</FieldPanel>
