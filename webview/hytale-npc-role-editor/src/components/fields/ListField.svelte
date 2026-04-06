<script lang="ts">
  import { flip } from "svelte/animate";
  import { GripVertical, Plus } from "lucide-svelte";
  import { dragHandle, dragHandleZone, type DndEvent } from "svelte-dnd-action";
  import SingleLineAutocompleteInput from "@webview-shared/components/SingleLineAutocompleteInput.svelte";
  import { onMount } from "svelte";
  import type { NpcPropertyListField } from "../../propertyModel";
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

  onMount(() => {
    itemViews = field.items.map(value => ({
      id: getNextItemId(),
      value,
    }));
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
    itemViews = [
      ...itemViews,
      {
        id: getNextItemId(),
        value: getDefaultNewItemValue(),
      },
    ];
  }

  function handleConsider(event: CustomEvent<DndEvent<ListItemView>>) {
    draftItemViews = event.detail.items;
  }

  function handleFinalize(event: CustomEvent<DndEvent<ListItemView>>) {
    draftItemViews = null;
    itemViews = event.detail.items;
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
  description={field.description}
  infoItems={field.infoItems}
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
            <FieldPanel title={`${index}`} inline handle={renderHandle}>
              {#if typeof itemView.value === "boolean"}
                <div class="inline-flex">
                  <input
                    class="size-6 accent-vsc-activity-bar-badge-bg"
                    type="checkbox"
                    checked={itemView.value}
                    onchange={event => {
                      itemViews = itemViews.map(item =>
                        item.id === itemView.id
                          ? {
                              ...item,
                              value: event.currentTarget.checked,
                            }
                          : item,
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
                    const nextValue = event.currentTarget.value;
                    itemViews = itemViews.map(item =>
                      item.id === itemView.id
                        ? {
                            ...item,
                            value: nextValue === "" ? "" : Number(nextValue),
                          }
                        : item,
                    );
                  }}
                />
              {:else}
                <SingleLineAutocompleteInput
                  inputId={`npc-property-${field.id}-${itemView.id}`}
                  initialValue={String(itemView.value)}
                  placeholder="Unset"
                  inputClass="w-full rounded-md border border-vsc-border px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100 bg-vsc-input-bg"
                  listClass="absolute left-0 right-0 top-full z-[160] max-h-40 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
                  optionClass="block w-full cursor-pointer px-3 py-2 text-left text-sm text-vsc-input-fg hover:bg-vsc-list-hover"
                  previewClass="z-[160]"
                  oncommit={value => {
                    itemViews = itemViews.map(item =>
                      item.id === itemView.id
                        ? {
                            ...item,
                            value,
                          }
                        : item,
                    );
                  }}
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
