<script lang="ts">
  import { flip } from "svelte/animate";
  import { GripVertical, Plus } from "lucide-svelte";
  import { dragHandle, dragHandleZone, type DndEvent } from "svelte-dnd-action";
  import ComputeAutocompleteInput from "@webview-shared/components/ComputeAutocompleteInput.svelte";
  import SingleLineAutocompleteInput from "@webview-shared/components/SingleLineAutocompleteInput.svelte";
  import type { Snippet } from "svelte";
  import { buildNpcComputeAutocompleteOptions } from "../../compute/computeAutocomplete";
  import type { NpcPropertyParameterField } from "../../propertyModel";
  import FieldPanel from "../FieldPanel.svelte";
  import { workspace } from "../../workspace.svelte";

  type ListItemValue = string | number | boolean;
  type ListItemView = {
    id: string;
    value: ListItemValue;
  };

  const FLIP_DURATION_MS = 100;

  let {
    field,
    titleContent,
    tooltipContent,
    handle,
    onunset,
    vscodeContext,
    onContextMenu,
    onInfoClick,
    interactiveInfoTooltip = false,
    infoTooltipPinned = false,
    hideInfoButton = false,
  }: {
    field: NpcPropertyParameterField;
    titleContent?: Snippet;
    tooltipContent?: Snippet;
    handle?: Snippet;
    onunset?: () => void;
    vscodeContext?: string;
    onContextMenu?: (event: MouseEvent) => void;
    onInfoClick?: () => void;
    interactiveInfoTooltip?: boolean;
    infoTooltipPinned?: boolean;
    hideInfoButton?: boolean;
  } = $props();

  let scalarDraftValue = $state("");
  let rawJsonDraftValue = $state("");
  let rangeStartDraftValue = $state("");
  let rangeEndDraftValue = $state("");
  let itemViews = $state<ListItemView[]>([]);
  let draftItemViews = $state<ListItemView[] | null>(null);
  let nextItemId = 0;

  const isInline = $derived(
    field.valueMode === "compute" ||
      field.literalKind === "string" ||
      field.literalKind === "number" ||
      field.literalKind === "boolean" ||
      field.editorType === "range",
  );
  const summary = $derived(
    field.valueMode === "literal" &&
      field.literalKind === "list" &&
      field.editorType !== "range" &&
      Array.isArray(field.literalValue)
      ? `${field.literalValue.length} list items`
      : undefined,
  );
  const renderedItemViews = $derived(draftItemViews ?? itemViews);
  const activeFlipDurationMs = $derived(draftItemViews ? FLIP_DURATION_MS : 0);
  const computeAutocompleteOptions = $derived(
    buildNpcComputeAutocompleteOptions({
      parameters: workspace.documentModel?.parameters?.entries,
      scope: "standard",
    }),
  );
  const stringAutocompleteOptions = $derived(
    field.symbolRef && workspace.autocompleteField === `npc-parameter-${field.id}`
      ? workspace.autocompleteValues.map(value => ({ value }))
      : [],
  );

  $effect(() => {
    if (field.valueMode === "compute") {
      scalarDraftValue = field.computeExpression ?? "";
      return;
    }

    if (field.literalKind === "string") {
      scalarDraftValue = typeof field.literalValue === "string" ? field.literalValue : "";
      return;
    }

    if (field.literalKind === "number") {
      scalarDraftValue =
        typeof field.literalValue === "number" ? String(field.literalValue) : "";
      return;
    }

    if (
      field.editorType === "range" &&
      Array.isArray(field.literalValue) &&
      field.literalValue.length >= 2
    ) {
      rangeStartDraftValue =
        typeof field.literalValue[0] === "number" ? String(field.literalValue[0]) : "0";
      rangeEndDraftValue =
        typeof field.literalValue[1] === "number" ? String(field.literalValue[1]) : "0";
      return;
    }

    if (field.literalKind === "rawJson") {
      rawJsonDraftValue = JSON.stringify(field.literalValue, null, 2);
      return;
    }

    if (field.literalKind === "list" && Array.isArray(field.literalValue)) {
      itemViews = field.literalValue
        .filter(isListItemValue)
        .map(value => ({
          id: getNextItemId(),
          value,
        }));
      draftItemViews = null;
    }
  });

  function getNextItemId() {
    return `npc-parameter-list-item-${field.id}-${nextItemId++}`;
  }

  function commitValue(value: unknown) {
    workspace.updateStandardParameterValue(field.parameterName, {
      kind: "literal",
      value,
    });
  }

  function commitComputeExpression(expression: string) {
    workspace.updateStandardParameterValue(field.parameterName, {
      kind: "compute",
      expression,
    });
  }

  function sanitizeNumber(value: string) {
    return value
      .trim()
      .replace(/[^\d.-]/g, "")
      .replace(/(?!^)-/g, "")
      .replace(/(\..*)\./g, "$1");
  }

  function commitNumberValue() {
    const sanitized = sanitizeNumber(scalarDraftValue);
    scalarDraftValue = sanitized;
    if (sanitized === "") {
      commitValue("");
      return;
    }

    const nextValue = Number(sanitized);
    if (Number.isNaN(nextValue)) {
      scalarDraftValue =
        typeof field.literalValue === "number" ? String(field.literalValue) : "";
      return;
    }

    commitValue(nextValue);
  }

  function commitRawJsonValue() {
    try {
      commitValue(JSON.parse(rawJsonDraftValue));
    } catch {
      rawJsonDraftValue = JSON.stringify(field.literalValue, null, 2);
    }
  }

  function commitRangeValue(index: 0 | 1) {
    const sanitized =
      index === 0 ? sanitizeNumber(rangeStartDraftValue) : sanitizeNumber(rangeEndDraftValue);
    if (index === 0) {
      rangeStartDraftValue = sanitized;
    } else {
      rangeEndDraftValue = sanitized;
    }

    const currentRange = Array.isArray(field.literalValue) ? field.literalValue : [0, 0];
    const nextRange: [number, number] = [
      typeof currentRange[0] === "number" ? currentRange[0] : 0,
      typeof currentRange[1] === "number" ? currentRange[1] : 0,
    ];

    if (sanitized === "") {
      nextRange[index] = 0;
      commitValue(nextRange);
      return;
    }

    const nextValue = Number(sanitized);
    if (Number.isNaN(nextValue)) {
      if (index === 0) {
        rangeStartDraftValue = String(nextRange[0]);
      } else {
        rangeEndDraftValue = String(nextRange[1]);
      }
      return;
    }

    nextRange[index] = nextValue;
    commitValue(nextRange);
  }

  function commitListItemViews(nextItemViews: ListItemView[]) {
    itemViews = nextItemViews;
    workspace.updateStandardParameterValue(field.parameterName, {
      kind: "literal",
      value: nextItemViews.map(item => item.value),
    });
  }

  function addListItem() {
    const nextItemViews = [
      ...itemViews,
      {
        id: getNextItemId(),
        value: getDefaultNewListItemValue(),
      },
    ];
    commitListItemViews(nextItemViews);
  }

  function getDefaultNewListItemValue(): ListItemValue {
    if (itemViews.every(item => typeof item.value === "boolean") && itemViews.length > 0) {
      return false;
    }

    if (itemViews.every(item => typeof item.value === "number") && itemViews.length > 0) {
      return 0;
    }

    return "";
  }

  function handleConsider(event: CustomEvent<DndEvent<ListItemView>>) {
    draftItemViews = event.detail.items;
  }

  function handleFinalize(event: CustomEvent<DndEvent<ListItemView>>) {
    draftItemViews = null;
    commitListItemViews(event.detail.items);
  }

  function isListItemValue(value: unknown): value is ListItemValue {
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
  }

  function requestScalarAutocomplete() {
    if (!field.symbolRef) {
      return;
    }

    workspace.requestAutocomplete(`npc-parameter-${field.id}`, field.symbolRef);
  }

  function getListItemAutocompleteOptions(inputId: string) {
    if (!field.itemSymbolRef || workspace.autocompleteField !== inputId) {
      return [];
    }

    return workspace.autocompleteValues.map(value => ({ value }));
  }

  function requestListItemAutocomplete(inputId: string) {
    if (!field.itemSymbolRef) {
      return;
    }

    workspace.requestAutocomplete(inputId, field.itemSymbolRef);
  }

  const gripHandle = (node: HTMLElement) => {
    const result = dragHandle(node);
    return () => result?.destroy?.();
  };
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
  inline={isInline}
  {summary}
  {titleContent}
  {tooltipContent}
  {handle}
  {onunset}
  {vscodeContext}
  {onContextMenu}
  {onInfoClick}
  {interactiveInfoTooltip}
  {infoTooltipPinned}
  {hideInfoButton}
>
  {#if field.valueMode === "compute"}
    <ComputeAutocompleteInput
      inputId={`npc-parameter-${field.id}`}
      initialValue={scalarDraftValue}
      data-vscode-context={"{}"}
      placeholder="Type for suggestions"
      autocompleteOptions={computeAutocompleteOptions}
      inputClass="w-full rounded-md border border-vsc-border px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100 bg-vsc-input-bg"
      listClass="absolute left-0 right-0 top-full z-[160] max-h-56 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
      optionClass="block w-full cursor-pointer border border-transparent px-3 py-2 text-left text-vsc-input-fg hover:bg-vsc-list-hover"
      oncommit={value => {
        scalarDraftValue = value;
        commitComputeExpression(value);
      }}
    />
  {:else if field.literalKind === "boolean"}
    <div class="inline-flex">
      <input
        class="size-6 accent-vsc-activity-bar-badge-bg"
        type="checkbox"
        data-vscode-context={"{}"}
        checked={field.literalValue === true}
        onchange={event => commitValue(event.currentTarget.checked)}
      />
    </div>
  {:else if field.literalKind === "number"}
    <input
      type="text"
      data-vscode-context={"{}"}
      class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
      bind:value={scalarDraftValue}
      placeholder="Unset"
      inputmode="decimal"
      oninput={event => {
        scalarDraftValue = sanitizeNumber(event.currentTarget.value);
      }}
      onblur={commitNumberValue}
      onkeydown={event => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          commitNumberValue();
          event.currentTarget.blur();
        }
      }}
    />
  {:else if field.literalKind === "string"}
    <SingleLineAutocompleteInput
      inputId={`npc-parameter-${field.id}`}
      initialValue={scalarDraftValue}
      data-vscode-context={"{}"}
      placeholder="Unset"
      autocompleteOptions={stringAutocompleteOptions}
      inputClass="w-full rounded-md border border-vsc-border px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100 bg-vsc-input-bg"
      listClass="absolute left-0 right-0 top-full z-[160] max-h-40 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
      optionClass="block w-full cursor-pointer px-3 py-2 text-left text-sm text-vsc-input-fg hover:bg-vsc-list-hover"
      previewClass="z-[160]"
      onfocus={requestScalarAutocomplete}
      oncommit={value => {
        scalarDraftValue = value;
        commitValue(value);
      }}
      afterEnterPressed={input => input.blur()}
    />
  {:else if field.editorType === "range"}
    <div class="grid grid-cols-2 gap-3">
      <input
        type="text"
        data-vscode-context={"{}"}
        class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
        bind:value={rangeStartDraftValue}
        placeholder="Min"
        inputmode="decimal"
        oninput={event => {
          rangeStartDraftValue = sanitizeNumber(event.currentTarget.value);
        }}
        onblur={() => commitRangeValue(0)}
        onkeydown={event => {
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            commitRangeValue(0);
            event.currentTarget.blur();
          }
        }}
      />
      <input
        type="text"
        data-vscode-context={"{}"}
        class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
        bind:value={rangeEndDraftValue}
        placeholder="Max"
        inputmode="decimal"
        oninput={event => {
          rangeEndDraftValue = sanitizeNumber(event.currentTarget.value);
        }}
        onblur={() => commitRangeValue(1)}
        onkeydown={event => {
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            commitRangeValue(1);
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  {:else if field.literalKind === "list"}
    {#if renderedItemViews.length > 0}
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
                onunset={() =>
                  commitListItemViews(itemViews.filter(item => item.id !== itemView.id))}
              >
                {#if typeof itemView.value === "boolean"}
                  <div class="inline-flex">
                    <input
                      class="size-6 accent-vsc-activity-bar-badge-bg"
                      type="checkbox"
                      data-vscode-context={"{}"}
                      checked={itemView.value}
                      onchange={event => {
                        commitListItemViews(
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
                    data-vscode-context={"{}"}
                    class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
                    value={String(itemView.value)}
                    inputmode="decimal"
                    oninput={event => {
                      const nextValue = sanitizeNumber(event.currentTarget.value);
                      event.currentTarget.value = nextValue;
                    }}
                    onblur={event => {
                      const nextValue = Number(event.currentTarget.value);
                      if (Number.isNaN(nextValue)) {
                        event.currentTarget.value = String(itemView.value);
                        return;
                      }

                      commitListItemViews(
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
                  {@const inputId = `npc-parameter-${field.id}-${itemView.id}`}
                  <SingleLineAutocompleteInput
                    {inputId}
                    initialValue={String(itemView.value)}
                    data-vscode-context={"{}"}
                    placeholder="Unset"
                    autocompleteOptions={getListItemAutocompleteOptions(inputId)}
                    inputClass="w-full rounded-md border border-vsc-border px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100 bg-vsc-input-bg"
                    listClass="absolute left-0 right-0 top-full z-[160] max-h-40 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
                    optionClass="block w-full cursor-pointer px-3 py-2 text-left text-sm text-vsc-input-fg hover:bg-vsc-list-hover"
                    previewClass="z-[160]"
                    onfocus={() => requestListItemAutocomplete(inputId)}
                    oncommit={value => {
                      commitListItemViews(
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
      onclick={addListItem}
    >
      <Plus size={14} />
      Add Item
    </button>
  {:else}
    <textarea
      data-vscode-context={"{}"}
      class="min-h-32 w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 font-mono text-sm text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
      bind:value={rawJsonDraftValue}
      placeholder="JSON value"
      onblur={commitRawJsonValue}
    ></textarea>
  {/if}
</FieldPanel>
