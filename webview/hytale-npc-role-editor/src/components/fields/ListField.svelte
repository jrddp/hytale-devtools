<script lang="ts">
  import { onDestroy } from "svelte";
  import { flip } from "svelte/animate";
  import { GripVertical, Plus } from "lucide-svelte";
  import { dragHandle, dragHandleZone, type DndEvent } from "svelte-dnd-action";
  import ComputeAutocompleteInput from "@webview-shared/components/ComputeAutocompleteInput.svelte";
  import SingleLineAutocompleteInput from "@webview-shared/components/SingleLineAutocompleteInput.svelte";
  import CommitNumberInput from "@webview-shared/components/inputs/CommitNumberInput.svelte";
  import { buildNpcComputeAutocompleteOptions } from "../../compute/computeAutocomplete";
  import { getNpcFieldTypeLabel, type NpcPropertyField } from "../../propertyModel";
  import { workspace } from "../../workspace.svelte";
  import FieldComputeToggleButton from "../FieldComputeToggleButton.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  type ListItemView = {
    id: string;
    value: string | number | boolean;
  };

  const FLIP_DURATION_MS = 100;

  let { field }: { field: NpcPropertyField } = $props();

  let collapsed = $state(false);
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

  $effect(() => {
    itemViews =
      field.value.kind === "literal" &&
      Array.isArray(field.value.value) &&
      field.value.value.every(isPrimitiveListItem)
        ? field.value.value.map(value => ({
            id: getNextItemId(),
            value,
          }))
        : [];
    draftItemViews = null;
  });

  const issues = $derived(workspace.getFieldIssues(field.fieldPath));
  const fieldVscodeContext = $derived(
    workspace.buildFieldVscodeContext(field.fieldPath, {
      canDeleteField: field.canUnset !== false && field.isSet !== false,
    }),
  );
  const renderedItemViews = $derived(draftItemViews ?? itemViews);
  const activeFlipDurationMs = $derived(draftItemViews ? FLIP_DURATION_MS : 0);
  const hasVisibleItems = $derived(renderedItemViews.length > 0);
  const summary = $derived(
    field.value.kind === "compute" ? undefined : `${itemViews.length} list items`,
  );
  const computeAutocompleteOptions = $derived(
    buildNpcComputeAutocompleteOptions({
      parameters: workspace.getStandardParameterFields(),
      scope: "standard",
    }),
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

  function isPrimitiveListItem(value: unknown): value is string | number | boolean {
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
  }

  function getNextItemId() {
    return `npc-list-item-${field.id}-${nextItemId++}`;
  }

  function getDefaultNewItemValue() {
    if (field.itemType === "number") {
      return 0;
    }

    if (field.itemType === "boolean") {
      return false;
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
    const suggestions = stateSuggestions ?? animationSuggestions ?? field.staticSuggestions;
    if (suggestions?.length) {
      const currentValue =
        typeof itemView?.value === "string" ? itemView.value.trim() : "";
      const usedValues = new Set(
        renderedItemViews
          .filter(candidate => candidate.id !== itemView?.id)
          .map(candidate => (typeof candidate.value === "string" ? candidate.value.trim() : ""))
          .filter(Boolean),
      );

      return suggestions
        .filter(value => value === currentValue || !usedValues.has(value))
        .map(value => ({ value }));
    }

    if (!field.symbolRef || workspace.autocompleteField !== inputId) {
      return [];
    }

    return workspace.autocompleteValues.map(value => ({ value }));
  }

  function requestAutocomplete(inputId: string) {
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
</script>

{#snippet computeToggle()}
  {#if field.computable && field.canChangeType === false}
    <FieldComputeToggleButton
      enabled
      active={field.value.kind === "compute"}
      ontoggle={() => workspace.toggleFieldComputeMode(field.fieldPath)}
    />
  {/if}
{/snippet}

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
  typeLabel={getNpcFieldTypeLabel(field)}
  required={field.required === true}
  description={field.description}
  issues={issues}
  inline={false}
  {summary}
  titleActions={computeToggle}
  vscodeContext={fieldVscodeContext}
  collapseStateKey={field.fieldPath}
  bind:collapsed
  onunset={field.canUnset !== false && field.isSet !== false
    ? () => {
        workspace.unsetField(field.fieldPath);
      }
    : undefined}
>
  {#if field.value.kind === "compute"}
    <ComputeAutocompleteInput
      inputId={`npc-property-${field.id}`}
      initialValue={field.value.expression}
      data-vscode-context={"{}"}
      placeholder="Type for suggestions"
      autocompleteOptions={computeAutocompleteOptions}
      inputClass="w-full rounded-md border border-vsc-border px-3 py-2 font-mono text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100 bg-vsc-input-bg"
      overlayClass="block w-full px-3 py-2 font-mono whitespace-pre"
      listClass="absolute left-0 right-0 top-full z-[160] max-h-56 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
      optionClass="block w-full cursor-pointer border border-transparent px-3 py-2 text-left text-vsc-input-fg hover:bg-vsc-list-hover"
      oncommit={value => workspace.updateFieldComputeExpression(field.fieldPath, value)}
    />
  {:else if hasVisibleItems}
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
                <CommitNumberInput
                  inputId={`npc-property-${field.id}-${itemView.id}`}
                  initialValue={itemView.value}
                  emptyValue={0}
                  inputClass="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
                  oncommit={value => {
                    commitItemViews(
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
                  onfocus={() => requestAutocomplete(inputId)}
                  onconsider={handleConsideredAnimation}
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
      No items yet.
    </div>
  {/if}

  {#if field.value.kind !== "compute"}
    <button
      type="button"
      class="flex w-full items-center gap-1 rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg opacity-80 hover:bg-vsc-button-hover"
      onclick={addItem}
    >
      <Plus size={14} />
      Add Item
    </button>
  {/if}
</FieldPanel>
