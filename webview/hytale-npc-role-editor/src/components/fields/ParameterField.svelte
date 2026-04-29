<script lang="ts">
  import { onDestroy } from "svelte";
  import { flip } from "svelte/animate";
  import { GripVertical, Plus } from "lucide-svelte";
  import { dragHandle, dragHandleZone, type DndEvent } from "svelte-dnd-action";
  import ComputeAutocompleteInput from "@webview-shared/components/ComputeAutocompleteInput.svelte";
  import SingleLineAutocompleteInput from "@webview-shared/components/SingleLineAutocompleteInput.svelte";
  import CommitNumberInput from "@webview-shared/components/inputs/CommitNumberInput.svelte";
  import type { Snippet } from "svelte";
  import { buildNpcComputeAutocompleteOptions } from "../../compute/computeAutocomplete";
  import { getNpcFieldTypeLabel, type NpcPropertyField } from "../../propertyModel";
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
    field: NpcPropertyField;
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

  let collapsed = $state(false);
  let scalarDraftValue = $state("");
  let rawJsonDraftValue = $state("");
  let itemViews = $state<ListItemView[]>([]);
  let draftItemViews = $state<ListItemView[] | null>(null);
  let nextItemId = 0;

  $effect(() => {
    collapsed = field.ui?.collapsed ?? false;
  });

  $effect(() => {
    if (!field.ui) {
      field.ui = {};
    }

    field.ui.collapsed = collapsed;
  });

  const isRange = $derived(
    field.kind === "list" &&
      field.itemType === "number" &&
      field.value.kind === "literal" &&
      Array.isArray(field.value.value) &&
      field.value.value.length === 2 &&
      field.value.value.every(item => typeof item === "number"),
  );
  const isInline = $derived(
    field.value.kind === "compute" ||
      field.kind === "string" ||
      field.kind === "number" ||
      field.kind === "boolean" ||
      isRange,
  );
  const summary = $derived(
    field.kind === "list" &&
      field.value.kind === "literal" &&
      Array.isArray(field.value.value) &&
      !isRange
      ? `${field.value.value.length} list items`
      : undefined,
  );
  const renderedItemViews = $derived(draftItemViews ?? itemViews);
  const activeFlipDurationMs = $derived(draftItemViews ? FLIP_DURATION_MS : 0);
  const computeAutocompleteOptions = $derived(
    buildNpcComputeAutocompleteOptions({
      parameters: workspace.getStandardParameterFields(),
      scope: "standard",
    }),
  );
  const resolvedVscodeContext = $derived(
    vscodeContext ?? workspace.buildFieldVscodeContext(field.fieldPath),
  );
  const issues = $derived(workspace.getFieldIssues(field.fieldPath));
  const hasComputeIssues = $derived(
    issues.some(issue => issue.code.startsWith("compute-")),
  );
  const computeInputStyle = $derived(
    hasComputeIssues
      ? "border-color: var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));"
      : undefined,
  );
  const stateSuggestions = $derived(
    field.stateAutocompleteKind
      ? workspace.getStateAutocompleteValues(field.stateAutocompleteKind)
      : undefined,
  );
  const animationSuggestions = $derived(
    field.animationAutocompleteKind
      ? workspace.getAnimationAutocompleteValues(field.animationAutocompleteKind)
      : undefined,
  );
  const stringAutocompleteOptions = $derived(
    (stateSuggestions ?? animationSuggestions ?? field.staticSuggestions)?.length
      ? (stateSuggestions ?? animationSuggestions ?? field.staticSuggestions)?.map(value => ({ value }))
      : field.symbolRef && workspace.autocompleteField === `npc-parameter-${field.id}`
        ? workspace.autocompleteValues.map(value => ({ value }))
        : [],
  );

  $effect(() => {
    if (field.value.kind === "compute") {
      scalarDraftValue = field.value.expression;
      return;
    }

    if (field.kind === "string") {
      scalarDraftValue = typeof field.value.value === "string" ? field.value.value : "";
      return;
    }

    if (field.kind === "number") {
      scalarDraftValue =
        typeof field.value.value === "number" ? String(field.value.value) : "";
      return;
    }

    if (field.kind === "rawJson" || field.kind === "graph") {
      rawJsonDraftValue = JSON.stringify(field.value.value, null, 2);
      return;
    }

    if (
      field.kind === "list" &&
      field.value.kind === "literal" &&
      Array.isArray(field.value.value)
    ) {
      itemViews = field.value.value
        .filter(isListItemValue)
        .map(value => ({
          id: getNextItemId(),
          value,
        }));
      draftItemViews = null;
    }
  });

  function isListItemValue(value: unknown): value is ListItemValue {
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
  }

  function getNextItemId() {
    return `npc-parameter-list-item-${field.id}-${nextItemId++}`;
  }

  function commitValue(value: unknown) {
    workspace.updateFieldValue(field.fieldPath, value);
  }

  function commitComputeExpression(expression: string) {
    workspace.updateFieldComputeExpression(field.fieldPath, expression);
  }

  function handleConsideredAnimation(value?: string) {
    if (!field.animationAutocompleteKind) {
      return;
    }

    if (value === undefined) {
      workspace.clearAppearanceAutocompleteAnimationOverride();
      return;
    }

    workspace.setAppearanceAutocompleteAnimationOverride(value);
  }

  onDestroy(() => {
    if (field.animationAutocompleteKind) {
      workspace.clearAppearanceAutocompleteAnimationOverride();
    }
  });

  function commitRawJsonValue() {
    try {
      commitValue(JSON.parse(rawJsonDraftValue));
    } catch {
      rawJsonDraftValue = JSON.stringify(field.value.kind === "literal" ? field.value.value : {}, null, 2);
    }
  }

  function updateRangeValue(index: 0 | 1, value: number | undefined) {
    const currentRange =
      field.value.kind === "literal" && Array.isArray(field.value.value)
        ? field.value.value
        : [0, 0];
    const nextRange: [number, number] = [
      typeof currentRange[0] === "number" ? currentRange[0] : 0,
      typeof currentRange[1] === "number" ? currentRange[1] : 0,
    ];
    nextRange[index] = value ?? 0;
    commitValue(nextRange);
  }

  function commitListItemViews(nextItemViews: ListItemView[]) {
    itemViews = nextItemViews;
    workspace.updateFieldValue(
      field.fieldPath,
      nextItemViews.map(item => item.value),
    );
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
    if (field.itemType === "number") {
      return 0;
    }
    if (field.itemType === "boolean") {
      return false;
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

  function getAutocompleteOptions(inputId: string, itemView?: ListItemView) {
    const suggestions = stateSuggestions ?? animationSuggestions ?? field.staticSuggestions;
    if (suggestions?.length) {
      return suggestions.map(value => ({ value }));
    }

    if (!field.symbolRef || workspace.autocompleteField !== inputId) {
      return [];
    }

    return workspace.autocompleteValues.map(value => ({ value }));
  }

  function requestListAutocomplete(inputId: string) {
    if (
      field.stateAutocompleteKind ||
      field.animationAutocompleteKind ||
      field.staticSuggestions?.length ||
      !field.symbolRef
    ) {
      return;
    }

    workspace.requestAutocomplete(inputId, field.symbolRef);
  }
</script>

{#snippet renderListHandle()}
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
  typeLabel={getNpcFieldTypeLabel(field)}
  required={field.required === true}
  description={field.description}
  issues={issues}
  inline={isInline}
  {summary}
  {handle}
  {titleContent}
  {tooltipContent}
  {onunset}
  vscodeContext={resolvedVscodeContext}
  {onContextMenu}
  {onInfoClick}
  {interactiveInfoTooltip}
  {infoTooltipPinned}
  {hideInfoButton}
  collapseStateKey={field.fieldPath}
  bind:collapsed
>
  {#if field.value.kind === "compute"}
    <ComputeAutocompleteInput
      inputId={`npc-parameter-${field.id}`}
      initialValue={scalarDraftValue}
      data-vscode-context={"{}"}
      style={computeInputStyle}
      placeholder="Type for suggestions"
      autocompleteOptions={computeAutocompleteOptions}
      inputClass="w-full rounded-md border border-vsc-border px-3 py-2 font-mono text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100 bg-vsc-input-bg"
      overlayClass="block w-full px-3 py-2 font-mono whitespace-pre"
      listClass="absolute left-0 right-0 top-full z-[160] max-h-56 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
      optionClass="block w-full cursor-pointer border border-transparent px-3 py-2 text-left text-vsc-input-fg hover:bg-vsc-list-hover"
      oncommit={value => {
        scalarDraftValue = value;
        commitComputeExpression(value);
      }}
    />
  {:else if field.kind === "boolean"}
    <div class="inline-flex">
      <input
        class="size-6 accent-vsc-activity-bar-badge-bg"
        type="checkbox"
        checked={field.value.value === true}
        onchange={event => commitValue(event.currentTarget.checked)}
      />
    </div>
  {:else if field.kind === "number"}
    <CommitNumberInput
      inputId={`npc-parameter-${field.id}`}
      initialValue={field.value.kind === "literal" && typeof field.value.value === "number"
        ? field.value.value
        : undefined}
      emptyValue={0}
      data-vscode-context={"{}"}
      inputClass="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
      placeholder="Unset"
      oncommit={value => commitValue(value ?? 0)}
    />
  {:else if field.kind === "string"}
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
      onfocus={() => {
        if (
          field.stateAutocompleteKind ||
          field.animationAutocompleteKind ||
          field.staticSuggestions?.length ||
          !field.symbolRef
        ) {
          return;
        }
        workspace.requestAutocomplete(`npc-parameter-${field.id}`, field.symbolRef);
      }}
      onconsider={handleConsideredAnimation}
      oncommit={value => {
        scalarDraftValue = value;
        commitValue(value);
      }}
      afterEnterPressed={input => input.blur()}
    />
  {:else if isRange}
    <div class="grid gap-2 md:grid-cols-2">
      <CommitNumberInput
        inputId={`npc-parameter-${field.id}-range-start`}
        initialValue={field.value.kind === "literal" &&
          Array.isArray(field.value.value) &&
          typeof field.value.value[0] === "number"
          ? field.value.value[0]
          : 0}
        emptyValue={0}
        data-vscode-context={"{}"}
        inputClass="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
        placeholder="Start"
        oncommit={value => updateRangeValue(0, value)}
      />
      <CommitNumberInput
        inputId={`npc-parameter-${field.id}-range-end`}
        initialValue={field.value.kind === "literal" &&
          Array.isArray(field.value.value) &&
          typeof field.value.value[1] === "number"
          ? field.value.value[1]
          : 0}
        emptyValue={0}
        data-vscode-context={"{}"}
        inputClass="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
        placeholder="End"
        oncommit={value => updateRangeValue(1, value)}
      />
    </div>
  {:else if field.kind === "list"}
    {#if renderedItemViews.length > 0}
      <div class="space-y-3">
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
                handle={renderListHandle}
                onunset={() => {
                  commitListItemViews(itemViews.filter(item => item.id !== itemView.id));
                }}
              >
                {#if typeof itemView.value === "boolean"}
                  <div class="inline-flex">
                    <input
                      class="size-6 accent-vsc-activity-bar-badge-bg"
                      type="checkbox"
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
                  <CommitNumberInput
                    inputId={`npc-parameter-${field.id}-${itemView.id}`}
                    initialValue={itemView.value}
                    emptyValue={0}
                    inputClass="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
                    oncommit={value => {
                      commitListItemViews(
                        itemViews.map(item =>
                          item.id === itemView.id
                            ? {
                                ...item,
                                value: value ?? 0,
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
                    onfocus={() => requestListAutocomplete(inputId)}
                    onconsider={handleConsideredAnimation}
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
                    afterEnterPressed={input => input.blur()}
                  />
                {/if}
              </FieldPanel>
            </div>
          {/each}
        </div>

        <button
          type="button"
          class="flex w-full items-center gap-1 rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg opacity-80 hover:bg-vsc-button-hover"
          onclick={addListItem}
        >
          <Plus size={14} />
          Add Item
        </button>
      </div>
    {:else}
      <div class="space-y-3">
        <div class="rounded-md border border-dashed border-vsc-border px-3 py-2 text-sm text-vsc-muted">
          No items yet.
        </div>

        <button
          type="button"
          class="flex w-full items-center gap-1 rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg opacity-80 hover:bg-vsc-button-hover"
          onclick={addListItem}
        >
          <Plus size={14} />
          Add Item
        </button>
      </div>
    {/if}
  {:else}
    <textarea
      data-vscode-context={"{}"}
      class="min-h-28 w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
      bind:value={rawJsonDraftValue}
      placeholder={"{ ... }"}
      onblur={commitRawJsonValue}
      onkeydown={event => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    ></textarea>
  {/if}
</FieldPanel>
