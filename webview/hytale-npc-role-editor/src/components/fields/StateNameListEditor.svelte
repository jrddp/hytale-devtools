<script lang="ts">
  import { flip } from "svelte/animate";
  import { GripVertical } from "lucide-svelte";
  import { dragHandle, dragHandleZone, type DndEvent } from "svelte-dnd-action";
  import SingleLineAutocompleteInput from "@webview-shared/components/SingleLineAutocompleteInput.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  type StringItemView = {
    id: string;
    value: string;
  };

  const FLIP_DURATION_MS = 100;

  let {
    title,
    values,
    suggestions = [],
    emptyText = "No values yet.",
    onchange,
  }: {
    title: string;
    values: string[];
    suggestions?: string[];
    emptyText?: string;
    onchange?: (values: string[]) => void;
  } = $props();

  let itemViews = $state<StringItemView[]>([]);
  let draftItemViews = $state<StringItemView[] | null>(null);
  let nextItemId = 0;

  $effect(() => {
    itemViews = values.map(value => ({
      id: `state-list-${title}-${nextItemId++}`,
      value,
    }));
    draftItemViews = null;
  });

  const renderedItemViews = $derived(draftItemViews ?? itemViews);
  const activeFlipDurationMs = $derived(draftItemViews ? FLIP_DURATION_MS : 0);

  function commitItemViews(nextItemViews: StringItemView[]) {
    itemViews = nextItemViews;
    onchange?.(nextItemViews.map(item => item.value));
  }

  function handleConsider(event: CustomEvent<DndEvent<StringItemView>>) {
    draftItemViews = event.detail.items;
  }

  function handleFinalize(event: CustomEvent<DndEvent<StringItemView>>) {
    draftItemViews = null;
    commitItemViews(event.detail.items);
  }

  function addItem() {
    commitItemViews([
      ...itemViews,
      {
        id: `state-list-${title}-${nextItemId++}`,
        value: "",
      },
    ]);
  }
</script>

{#snippet rowHandle()}
  <div
    use:dragHandle
    class="relative z-10 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-vsc-muted opacity-80 outline-none transition-[color,opacity] hover:text-vsc-input-fg"
    aria-label="Reorder state"
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

<FieldPanel title={title} typeLabel="String List" inline={false}>
  {#if renderedItemViews.length > 0}
    <div
      class="space-y-3"
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
            handle={rowHandle}
            onunset={() => {
              commitItemViews(itemViews.filter(item => item.id !== itemView.id));
            }}
          >
            <SingleLineAutocompleteInput
              inputId={`state-list-${title}-${itemView.id}`}
              initialValue={itemView.value}
              data-vscode-context={"{}"}
              placeholder="State"
              autocompleteOptions={suggestions.map(value => ({ value }))}
              inputClass="w-full rounded-md border border-vsc-border px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100 bg-vsc-input-bg"
              listClass="absolute left-0 right-0 top-full z-[160] max-h-40 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
              optionClass="block w-full cursor-pointer px-3 py-2 text-left text-sm text-vsc-input-fg hover:bg-vsc-list-hover"
              previewClass="z-[160]"
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
          </FieldPanel>
        </div>
      {/each}
    </div>
  {:else}
    <div class="rounded-md border border-dashed border-vsc-border px-3 py-2 text-sm text-vsc-muted opacity-75">
      {emptyText}
    </div>
  {/if}

  <button
    type="button"
    class="mt-3 flex w-full items-center gap-1 rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg opacity-80 hover:bg-vsc-button-hover"
    onclick={addItem}
  >
    Add State
  </button>
</FieldPanel>
