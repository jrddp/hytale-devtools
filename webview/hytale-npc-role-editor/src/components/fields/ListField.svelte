<script lang="ts">
  import { flip } from "svelte/animate";
  import { GripVertical, Plus } from "lucide-svelte";
  import { dragHandle, dragHandleZone, type DndEvent } from "svelte-dnd-action";
  import SingleLineAutocompleteInput from "@webview-shared/components/SingleLineAutocompleteInput.svelte";
  import type { NpcPropertyListField } from "../../propertyModel";
  import { workspace } from "../../workspace.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  type ListItemView = {
    id: string;
    value: string | number | boolean;
  };

  const FLIP_DURATION_MS = 100;

  let { field }: { field: NpcPropertyListField } = $props();

  let collapsed = $state(false);
  let itemViews = $state<ListItemView[]>([]);
  let draftItemViews = $state<ListItemView[] | null>(null);
  let nextItemId = 0;

  $effect(() => {
    itemViews = field.items.map(value => ({
      id: getNextItemId(),
      value,
    }));
    draftItemViews = null;
  });

  const renderedItemViews = $derived(draftItemViews ?? itemViews);
  const activeFlipDurationMs = $derived(draftItemViews ? FLIP_DURATION_MS : 0);
  const hasVisibleItems = $derived(renderedItemViews.length > 0);
  const summary = $derived(`${itemViews.length} list items`);

  const gripHandle = (node: HTMLElement) => {
    const result = dragHandle(node);
    return () => result?.destroy?.();
  };

  function getNextItemId() {
    return `npc-list-item-${field.id}-${nextItemId++}`;
  }

  function getDefaultNewItemValue() {
    if (itemViews.every(item => typeof item.value === "boolean") && itemViews.length > 0) {
      return false;
    }

    if (itemViews.every(item => typeof item.value === "number") && itemViews.length > 0) {
      return 0;
    }

    return "";
  }

  function addItem() {
    commitItemViews([
      ...itemViews,
      {
        id: getNextItemId(),
        value: getDefaultNewItemValue(),
      },
    ]);
  }

  function handleConsider(event: CustomEvent<DndEvent<ListItemView>>) {
    draftItemViews = event.detail.items;
  }

  function handleFinalize(event: CustomEvent<DndEvent<ListItemView>>) {
    draftItemViews = null;
    commitItemViews(event.detail.items);
  }

  function commitItemViews(nextItemViews: ListItemView[]) {
    itemViews = nextItemViews;
    workspace.updateFieldValue(
      field.fieldPath,
      nextItemViews.map(item => item.value),
    );
  }

  function getAutocompleteOptions(inputId: string, itemView?: ListItemView) {
    if (field.itemAutocompleteValues) {
      const currentValue =
        typeof itemView?.value === "string" ? itemView.value.trim() : "";
      const usedValues = new Set(
        renderedItemViews
          .filter(candidate => candidate.id !== itemView?.id)
          .map(candidate => (typeof candidate.value === "string" ? candidate.value.trim() : ""))
          .filter(Boolean),
      );

      return field.itemAutocompleteValues
        .filter(value => value === currentValue || !usedValues.has(value))
        .map(value => ({ value }));
    }

    if (!field.itemSymbolRef || workspace.autocompleteField !== inputId) {
      return [];
    }

    return workspace.autocompleteValues.map(value => ({ value }));
  }

  function requestAutocomplete(inputId: string) {
    if (field.itemAutocompleteValues) {
      return;
    }

    if (!field.itemSymbolRef) {
      return;
    }

    workspace.requestAutocomplete(inputId, field.itemSymbolRef);
  }
</script>

{#snippet renderHandle()}
  <div
    use:dragHandle
    class="relative z-10 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-vsc-muted opacity-80 outline-none transition-[color,opacity] hover:text-vsc-input-fg"
    aria-label="Reorder list item"
    role="button"
    tabindex={-1}
    onclick={event => event.stopPropagation()}
    onkeydown={event => {
      if (event.key === "Enter" || event.key === " ") {
        event.stopPropagation();
      }
    }}
  >
    <GripVertical size={14} />
  </div>
{/snippet}

<FieldPanel
  title={field.label}
  typeLabel={field.typeLabel}
  description={field.description}
  infoItems={field.infoItems}
  issues={field.issues}
  inline={false}
  {summary}
  bind:collapsed
>
  {#if hasVisibleItems}
    <div class="relative">
      <div
        class="-mx-3 -my-6 space-y-3 rounded-lg px-3 py-6"
        use:dragHandleZone={{
          items: renderedItemViews,
          flipDurationMs: activeFlipDurationMs,
          dropFromOthersDisabled: true,
          dropTargetStyle: {
            outline: "none",
          },
        }}
        onconsider={handleConsider}
              onfinalize={handleFinalize}
      >
        {#each renderedItemViews as itemView, index (itemView.id)}
          <div animate:flip={{ duration: activeFlipDurationMs }}>
            <FieldPanel
              title={`${index}`}
              inline
              handle={renderHandle}
              onunset={() => {
                commitItemViews(itemViews.filter(item => item.id !== itemView.id));
              }}
            >
              {#if typeof itemView.value === "boolean"}
                <div class="inline-flex">
                  <input
                    class="size-6 accent-vsc-activity-bar-badge-bg"
                    type="checkbox"
                    checked={itemView.value}
                    onchange={event => {
                      commitItemViews(
                        itemViews.map(item =>
                          item.id === itemView.id
                            ? {
                                ...item,
                                value: event.currentTarget.checked,
                              }
                            : item,
                        ),
                      );
                    }}
                  />
                </div>
              {:else if typeof itemView.value === "number"}
                <input
                  type="text"
                  class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
                  value={String(itemView.value)}
                  inputmode="decimal"
                  oninput={event => {
                    const nextValue = event.currentTarget.value
                      .trim()
                      .replace(/[^\d.-]/g, "")
                      .replace(/(?!^)-/g, "")
                      .replace(/(\..*)\./g, "$1");
                    event.currentTarget.value = nextValue;
                  }}
                  onblur={event => {
                    const nextValue = Number(event.currentTarget.value);
                    if (Number.isNaN(nextValue)) {
                      event.currentTarget.value = String(itemView.value);
                      return;
                    }

                    commitItemViews(
                      itemViews.map(item =>
                        item.id === itemView.id
                          ? {
                              ...item,
                              value: nextValue,
                            }
                          : item,
                      ),
                    );
                  }}
                />
              {:else}
                {@const inputId = `npc-property-${field.id}-${itemView.id}`}
                <SingleLineAutocompleteInput
                  {inputId}
                  initialValue={String(itemView.value)}
                  placeholder="Unset"
                  autocompleteOptions={getAutocompleteOptions(inputId, itemView)}
                  inputClass="w-full rounded-md border border-vsc-border px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100 bg-vsc-input-bg"
                  listClass="absolute left-0 right-0 top-full z-[160] max-h-40 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
                  optionClass="block w-full cursor-pointer px-3 py-2 text-left text-sm text-vsc-input-fg hover:bg-vsc-list-hover"
                  previewClass="z-[160]"
                  onfocus={() => requestAutocomplete(inputId)}
                  oncommit={value => {
                    commitItemViews(
                      itemViews.map(item =>
                        item.id === itemView.id
                          ? {
                              ...item,
                              value,
                            }
                          : item,
                      ),
                    );
                  }}
                  afterEnterPressed={input => input.blur()}
                />
              {/if}
            </FieldPanel>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="rounded-md border border-dashed border-vsc-border px-3 py-2 text-sm text-vsc-muted">
      Empty list
    </div>
  {/if}

  <button
    type="button"
    class="flex w-full items-center gap-1 rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg opacity-80 hover:bg-vsc-button-hover"
    onclick={addItem}
  >
    <Plus size={14} />
    Add Item
  </button>
</FieldPanel>
