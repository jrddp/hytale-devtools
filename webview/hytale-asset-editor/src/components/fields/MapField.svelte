<script lang="ts">
  import { Plus, Redo2 } from "lucide-svelte";
  import type { RenderFieldProps } from "src/common";
  import FieldRenderer from "src/components/FieldRenderer.svelte";
  import ReadOnlyInputWrapper from "src/components/ReadOnlyInputWrapper.svelte";
  import { isFieldSet } from "src/components/fieldHelpers";
  import type { Snippet } from "svelte";
  import type { FieldInstance, MapFieldInstance } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  interface Props extends RenderFieldProps<MapFieldInstance> {
    renderField?: Snippet<[FieldInstance, number, (() => void)?]>;
  }

  let { field, renderField, depth = 0, readOnly = false, readOnlyMessage }: Props = $props();
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

  function addEntry() {
    field.entries = [
      ...field.entries,
      {
        key: `entry${field.entries.length + 1}`,
        valueField: workspace.createEmptyFieldInstance(field.valueField),
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
    if (field.entries[index]?.key === nextKey) {
      return;
    }

    field.entries[index].key = nextKey;

    // TODO FIXME we should be persisting empty map entries since we want to ensure we persist their keys
    if (isFieldSet(field.entries[index]?.valueField)) {
      workspace.applyDocumentState();
    }
  }
</script>

<FieldPanel
  {field}
  {depth}
  {readOnly}
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
    <div class="p-3 space-y-3 border border-dashed rounded-md border-vsc-border">
      <div class="flex items-center gap-2">
        <ReadOnlyInputWrapper
          readOnly={entriesReadOnly}
          readOnlyMessage={childReadOnlyMessage}
          class="w-full min-w-0"
        >
          {#if entriesReadOnly}
            <div
              class="w-full px-3 py-2 font-semibold break-all whitespace-pre-wrap border rounded-md select-text border-vsc-border bg-vsc-panel-readonly text-vsc-input-fg"
            >
              {entry.key}
            </div>
          {:else}
            <input
              type="text"
              class="w-full px-3 py-2 border rounded-md border-vsc-border bg-vsc-input-bg text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
              value={entry.key}
              placeholder="Key"
              onblur={event => commitEntryKey(event.currentTarget.value, index)}
              onkeydown={event => {
                if (event.key !== "Enter") {
                  return;
                }

                event.preventDefault();
                commitEntryKey(event.currentTarget.value, index);
                event.currentTarget.blur();
              }}
            />
          {/if}
        </ReadOnlyInputWrapper>
      </div>

      {#if renderField}
        {@render renderField(
          entry.valueField,
          depth + 1,
          !entriesReadOnly ? () => removeEntry(index) : undefined,
        )}
      {:else}
        <FieldRenderer
          field={entry.valueField}
          depth={depth + 1}
          readOnly={entriesReadOnly}
          readOnlyMessage={childReadOnlyMessage}
          onunset={!entriesReadOnly ? () => removeEntry(index) : undefined}
        />
      {/if}
    </div>
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
