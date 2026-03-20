<script lang="ts">
  import { flip } from "svelte/animate";
  import { GripVertical, Plus, Redo2 } from "lucide-svelte";
  import { dragHandle, dragHandleZone, type DndEvent } from "svelte-dnd-action";
  import { type FieldPanelHandle, type RenderFieldProps } from "src/common";
  import FieldRenderer from "src/components/FieldRenderer.svelte";
  import type { ArrayFieldInstance, FieldInstance } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import { humanize } from "../fieldHelpers";

  type ArrayFieldDndItem = {
    id: string;
    field: FieldInstance;
  };

  const FLIP_DURATION_MS = 100;

  let {
    field,
    depth = 0,
    readOnly = false,
    readOnlyMessage,
    fieldPanelOverrides,
    handle,
  }: RenderFieldProps<ArrayFieldInstance> = $props();

  const hasInheritedOnlyItems = $derived(field.items.length === 0 && field.inheritedItems.length > 0);
  const visibleItems = $derived(hasInheritedOnlyItems ? field.inheritedItems : field.items);
  const itemsReadOnly = $derived(readOnly || hasInheritedOnlyItems);
  const childReadOnlyMessage = $derived(
    hasInheritedOnlyItems
      ? `Inherited by ${field.schemaKey ?? "parent"}.\nOverride to edit.`
      : readOnlyMessage,
  );
  const canReorder = $derived(!readOnly && !hasInheritedOnlyItems && !field.isTuple);
  const summary = $derived(
    hasInheritedOnlyItems ? `${visibleItems.length} inherited items` : `${visibleItems.length} list items`,
  );

  const fieldClientIds = new WeakMap<FieldInstance, string>();
  let nextFieldClientId = 0;
  let draftItemViews = $state<ArrayFieldDndItem[] | null>(null);

  const visibleItemViews = $derived.by(() => {
    return visibleItems.map(item => ({
      id: getFieldClientId(item),
      field: item,
    }));
  });
  const renderedItemViews = $derived(draftItemViews ?? visibleItemViews);

  const gripHandle = (node: HTMLElement) => {
    const result = dragHandle(node);
    return () => result?.destroy?.();
  };

  function addItem() {
    if (field.isTuple === true) {
      console.error("Attempted to add item to tuple array");
      return;
    }

    const newItem = workspace.createEmptyFieldInstance(field.itemFieldTypes);
    field.items.push(newItem);
    syncItemSchemaKeys(field.items);
    workspace.applyDocumentState();
  }

  function overrideParentValue() {
    if (!hasInheritedOnlyItems) {
      return;
    }

    field.items = structuredClone($state.snapshot(field.inheritedItems)) as FieldInstance[];
    syncItemSchemaKeys(field.items);
    draftItemViews = null;
    workspace.applyDocumentState();
  }

  function removeItem(index: number) {
    field.items.splice(index, 1);
    syncItemSchemaKeys(field.items);
    draftItemViews = null;
    workspace.applyDocumentState();
  }

  function getFieldClientId(item: FieldInstance): string {
    let id = fieldClientIds.get(item);
    if (!id) {
      id = `array-field-item-${nextFieldClientId++}`;
      fieldClientIds.set(item, id);
    }
    return id;
  }

  function syncItemSchemaKeys(items: FieldInstance[]) {
    items.forEach((item, index) => {
      item.schemaKey = index.toString();
    });
  }

  function handleConsider(event: CustomEvent<DndEvent<ArrayFieldDndItem>>) {
    if (!canReorder) {
      return;
    }

    draftItemViews = event.detail.items;
  }

  function handleFinalize(event: CustomEvent<DndEvent<ArrayFieldDndItem>>) {
    if (!canReorder) {
      draftItemViews = null;
      return;
    }

    const nextItems = event.detail.items.map(item => item.field);
    const didOrderChange = nextItems.some((item, index) => item !== field.items[index]);

    draftItemViews = null;
    if (!didOrderChange) {
      return;
    }

    field.items = nextItems;
    syncItemSchemaKeys(field.items);
    workspace.applyDocumentState();
  }

  function createHandle(item: FieldInstance, index: number): FieldPanelHandle {
    const itemLabel = humanize(item.title ?? item.schemaKey ?? item.type) ?? "item";
    return {
      ariaLabel: `Reorder ${itemLabel} item ${index + 1}`,
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
  fieldPanelOverrides={fieldPanelOverrides}
  {handle}
  childReadOnly={hasInheritedOnlyItems}
  {summary}
  collapsedByDefault={field.collapsedByDefault ?? true}
>
  {#if hasInheritedOnlyItems && !readOnly}
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
          items: renderedItemViews,
          flipDurationMs: FLIP_DURATION_MS,
          dropTargetStyle: {
            outline: "none",
          },
        }}
        onconsider={handleConsider}
        onfinalize={handleFinalize}
      >
        {#each renderedItemViews as itemView, index (itemView.id)}
          <div animate:flip={{ duration: FLIP_DURATION_MS }}>
            <FieldRenderer
              field={itemView.field}
              depth={depth + 1}
              readOnly={itemsReadOnly}
              readOnlyMessage={childReadOnlyMessage}
              handle={createHandle(itemView.field, index)}
              onunset={!itemsReadOnly ? () => removeItem(index) : undefined}
            />
          </div>
        {/each}
      </div>
    </div>
  {:else}
    {#each renderedItemViews as itemView, index (itemView.id)}
      <FieldRenderer
        field={itemView.field}
        depth={depth + 1}
        readOnly={itemsReadOnly}
        readOnlyMessage={childReadOnlyMessage}
        onunset={!itemsReadOnly ? () => removeItem(index) : undefined}
      />
    {/each}
  {/if}

  {#if !field.isTuple && !readOnly && !hasInheritedOnlyItems}
    <button
      type="button"
      class="rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg hover:bg-vsc-button-hover w-full opacity-80 flex items-center gap-1"
      onclick={addItem}
    >
      <Plus size={14} />
      Add Item
    </button>
  {/if}
</FieldPanel>
