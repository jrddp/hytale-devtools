<script lang="ts">
  import { flip } from "svelte/animate";
  import { GripVertical, Plus, Redo2 } from "lucide-svelte";
  import { dragHandle, dragHandleZone, type DndEvent } from "svelte-dnd-action";
  import { type FieldPanelHandle, type RenderFieldProps } from "src/common";
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

  type MapEntry = MapFieldInstance["entries"][number];
  type MapEntryDndItem = {
    id: string;
    entry: MapEntry;
  };

  const FLIP_DURATION_MS = 100;

  let {
    field,
    depth = 0,
    readOnly = false,
    readOnlyMessage,
    fieldPanelOverrides,
    handle,
  }: RenderFieldProps<MapFieldInstance> = $props();

  const hasInheritedOnlyEntries = $derived(
    field.entries.length === 0 && field.inheritedEntries.length > 0,
  );
  const visibleEntries = $derived(hasInheritedOnlyEntries ? field.inheritedEntries : field.entries);
  const entriesReadOnly = $derived(readOnly || hasInheritedOnlyEntries);
  const canReorder = $derived(!readOnly && !hasInheritedOnlyEntries);
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
  let draftEntryViews = $state<MapEntryDndItem[] | null>(null);

  const visibleEntryViews = $derived.by(() => {
    return visibleEntries.map(entry => ({
      id: getEntryId(entry),
      entry,
    }));
  });
  const renderedEntryViews = $derived(draftEntryViews ?? visibleEntryViews);

  const gripHandle = (node: HTMLElement) => {
    const result = dragHandle(node);
    return () => result?.destroy?.();
  };

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

    field.entries = structuredClone($state.snapshot(field.inheritedEntries)) as MapEntry[];
    syncEntrySchemaKeys(field.entries);
    draftEntryViews = null;
    workspace.applyDocumentState();
  }

  function findEntryIndex(entryValueField: FieldInstance) {
    return field.entries.findIndex(entry => entry.valueField === entryValueField);
  }

  function removeEntry(entryValueField: FieldInstance) {
    const entryIndex = findEntryIndex(entryValueField);
    if (entryIndex === -1) {
      return;
    }

    field.entries.splice(entryIndex, 1);
    draftEntryViews = null;
    workspace.applyDocumentState();
  }

  function commitEntryKey(nextKey: string, entryValueField: FieldInstance) {
    const normalizedKey = nextKey.trim();
    if (!normalizedKey) {
      return false;
    }

    const entryIndex = findEntryIndex(entryValueField);
    if (entryIndex === -1) {
      return false;
    }

    if (field.entries[entryIndex]?.key === normalizedKey) {
      return;
    }

    field.entries[entryIndex].key = normalizedKey;
    field.entries[entryIndex].valueField.schemaKey = normalizedKey;

    // TODO FIXME we should be persisting empty map entries since we want to ensure we persist their keys
    if (isFieldSet(field.entries[entryIndex]?.valueField)) {
      workspace.applyDocumentState();
    }

    return true;
  }

  function getEntryKeyField(entry: MapEntry) {
    let entryKeyField = entryKeyFields.get(entry.valueField);
    if (!entryKeyField) {
      entryKeyField = workspace.createEmptyFieldInstance(field.keyField);
      entryKeyFields.set(entry.valueField, entryKeyField);
    }

    entryKeyField.value = entry.key;
    return entryKeyField;
  }

  function syncEntrySchemaKeys(entries: MapEntry[]) {
    entries.forEach(entry => {
      entry.valueField.schemaKey = entry.key;
    });
  }

  // Keep row identity derived from the serialized map key so rows survive reparses.
  function getEntryId(entry: MapEntry): string {
    return `map-field-entry-${entry.key}`;
  }

  function handleConsider(event: CustomEvent<DndEvent<MapEntryDndItem>>) {
    if (!canReorder) {
      return;
    }

    draftEntryViews = event.detail.items;
  }

  function handleFinalize(event: CustomEvent<DndEvent<MapEntryDndItem>>) {
    if (!canReorder) {
      draftEntryViews = null;
      return;
    }

    const nextEntries = event.detail.items.map(item => item.entry);
    const didOrderChange = nextEntries.some((entry, index) => entry !== field.entries[index]);

    draftEntryViews = null;
    if (!didOrderChange) {
      return;
    }

    field.entries = nextEntries;
    syncEntrySchemaKeys(field.entries);
    workspace.applyDocumentState();
  }

  function createHandle(entry: MapEntry, index: number): FieldPanelHandle {
    const entryLabel = entry.key.trim() || "entry";
    return {
      ariaLabel: `Reorder ${entryLabel} map entry ${index + 1}`,
      attach: gripHandle,
      icon: renderHandleIcon,
    };
  }
</script>

{#snippet renderHandleIcon()}
  <GripVertical size={14} />
{/snippet}

<FieldPanel
  {field}
  {depth}
  {readOnly}
  {fieldPanelOverrides}
  {handle}
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

  {#if canReorder}
    <div class="relative">
      <div
        class="-mx-3 -my-6 space-y-3 rounded-lg px-3 py-6"
        use:dragHandleZone={{
          items: renderedEntryViews,
          flipDurationMs: FLIP_DURATION_MS,
          dropTargetStyle: {
            outline: "none",
          },
        }}
        onconsider={handleConsider}
        onfinalize={handleFinalize}
      >
        {#each renderedEntryViews as entryView, index (entryView.id)}
          <div animate:flip={{ duration: FLIP_DURATION_MS }}>
            {#snippet entryTitle()}
              <StringField
                field={getEntryKeyField(entryView.entry)}
                depth={depth + 1}
                readOnly={entriesReadOnly}
                readOnlyMessage={childReadOnlyMessage}
                applyDocumentStateOnCommit={false}
                fieldPanelOverrides={{ minimal: true }}
                oncommitchange={nextKey => commitEntryKey(nextKey ?? "", entryView.entry.valueField)}
              />
            {/snippet}
            <FieldRenderer
              field={entryView.entry.valueField}
              depth={depth + 1}
              readOnly={entriesReadOnly}
              readOnlyMessage={childReadOnlyMessage}
              fieldPanelOverrides={{
                title: entryTitle,
              }}
              handle={createHandle(entryView.entry, index)}
              onunset={!entriesReadOnly ? () => removeEntry(entryView.entry.valueField) : undefined}
            />
          </div>
        {/each}
      </div>
    </div>
  {:else}
    {#each renderedEntryViews as entryView, index (entryView.id)}
      {@const entryKeyField = getEntryKeyField(entryView.entry)}
      {#snippet entryTitle()}
        <StringField
          field={entryKeyField}
          depth={depth + 1}
          readOnly={entriesReadOnly}
          readOnlyMessage={childReadOnlyMessage}
          applyDocumentStateOnCommit={false}
          fieldPanelOverrides={{ minimal: true }}
          oncommitchange={nextKey => commitEntryKey(nextKey ?? "", entryView.entry.valueField)}
        />
      {/snippet}
      <FieldRenderer
        field={entryView.entry.valueField}
        depth={depth + 1}
        readOnly={entriesReadOnly}
        readOnlyMessage={childReadOnlyMessage}
        fieldPanelOverrides={{
          title: entryTitle,
        }}
        onunset={!entriesReadOnly ? () => removeEntry(entryView.entry.valueField) : undefined}
      />
    {/each}
  {/if}

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
