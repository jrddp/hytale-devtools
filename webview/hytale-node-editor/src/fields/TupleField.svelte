<script lang="ts">
  import FieldLayout from "@node-editor/fields/FieldLayout.svelte";
  import type { FieldProps } from "@node-editor/node-editor/utils/fieldUtils";
  import { formatNodeFieldPlaceholder } from "@node-editor/node-editor/utils/fieldPlaceholders";
  import type { NodeTupleItemType } from "@shared/node-editor/workspaceTypes";
  import type { Snippet } from "svelte";
  import CommitNumberInput from "../../../shared/components/inputs/CommitNumberInput.svelte";
  import CommitTextInput from "../../../shared/components/inputs/CommitTextInput.svelte";

  let {
    inputId,
    label,
    description,
    initialValue,
    defaultValue,
    inputWidth,
    tupleSize,
    tupleItemType,
    titleActions,
    onconfirm,
  }: FieldProps<unknown[]> & {
    defaultValue?: unknown;
    tupleSize: number;
    tupleItemType: NodeTupleItemType;
    titleActions?: Snippet;
  } = $props();

  const inputClass =
    "nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg";
  const effectiveTupleSize = $derived(Math.max(0, Math.trunc(tupleSize)));
  const renderInline = $derived(effectiveTupleSize <= 2);
  const tupleIndexes = $derived(Array.from({ length: effectiveTupleSize }, (_, index) => index));
  const defaultItems = $derived(Array.isArray(defaultValue) ? defaultValue : []);

  let draftItems = $state<Array<unknown | undefined>>([]);
  let lastEmittedValueKey: string | null = null;

  $effect(() => {
    const sourceKey = stableValueKey(initialValue);
    if (sourceKey === lastEmittedValueKey) {
      return;
    }

    draftItems = normalizeDraftItems(initialValue);
    lastEmittedValueKey = null;
  });

  function stableValueKey(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function normalizeDraftItems(value: unknown): Array<unknown | undefined> {
    const source = Array.isArray(value) ? value : [];
    return tupleIndexes.map(index => coerceDraftValue(source[index]));
  }

  function coerceDraftValue(value: unknown): unknown | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (tupleItemType === "string") {
      return typeof value === "string" ? value : String(value);
    }

    const numericValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numericValue)) {
      return undefined;
    }

    return tupleItemType === "int" ? Math.trunc(numericValue) : numericValue;
  }

  function isBlankDraftValue(value: unknown): boolean {
    return value === undefined || value === "";
  }

  function getItemInputId(index: number): string {
    return `${inputId}-${index}`;
  }

  function getItemPlaceholder(index: number): string {
    return formatNodeFieldPlaceholder(defaultItems[index]);
  }

  function getStringInitialValue(index: number): string | undefined {
    const value = draftItems[index];
    if (value === undefined) {
      return undefined;
    }

    return typeof value === "string" ? value : String(value);
  }

  function getNumberInitialValue(index: number): number | undefined {
    const value = draftItems[index];
    return typeof value === "number" ? value : undefined;
  }

  function getFallbackItemValue(index: number): unknown {
    const defaultItem = coerceDraftValue(defaultItems[index]);
    if (defaultItem !== undefined) {
      return defaultItem;
    }

    return tupleItemType === "string" ? "" : 0;
  }

  function buildCommittedTuple(nextDraftItems: Array<unknown | undefined>): unknown[] {
    return tupleIndexes.map(index => {
      const value = nextDraftItems[index];
      if (isBlankDraftValue(value)) {
        return getFallbackItemValue(index);
      }

      return coerceDraftValue(value) ?? getFallbackItemValue(index);
    });
  }

  function updateItem(index: number, nextValue: unknown | undefined) {
    const nextDraftItems = draftItems.slice(0, effectiveTupleSize);
    while (nextDraftItems.length < effectiveTupleSize) {
      nextDraftItems.push(undefined);
    }
    nextDraftItems[index] = nextValue;
    draftItems = nextDraftItems;

    if (nextDraftItems.every(isBlankDraftValue)) {
      lastEmittedValueKey = stableValueKey([]);
      onconfirm([]);
      return;
    }

    const nextTupleValue = buildCommittedTuple(nextDraftItems);
    lastEmittedValueKey = stableValueKey(nextTupleValue);
    onconfirm(nextTupleValue);
  }
</script>

<FieldLayout {inputId} {label} {description} align="start" {titleActions}>
  <div
    class="flex min-w-0 gap-1.5"
    class:flex-row={renderInline}
    class:flex-col={!renderInline}
    class:w-full={inputWidth === undefined}
    style:width={inputWidth !== undefined ? `${inputWidth}px` : undefined}
  >
    {#each tupleIndexes as index}
      <div class="min-w-0" class:flex-1={renderInline}>
        {#if tupleItemType === "string"}
          <CommitTextInput
            inputId={getItemInputId(index)}
            initialValue={getStringInitialValue(index)}
            placeholder={getItemPlaceholder(index)}
            aria-label={`${label} item ${index + 1}`}
            inputClass={inputClass}
            enterBehavior="focus-next"
            focusRootSelector="[data-node-editor-root]"
            stopPointerPropagation
            oncommit={nextValue => updateItem(index, nextValue)}
          />
        {:else}
          <CommitNumberInput
            inputId={getItemInputId(index)}
            initialValue={getNumberInitialValue(index)}
            placeholder={getItemPlaceholder(index)}
            aria-label={`${label} item ${index + 1}`}
            integer={tupleItemType === "int"}
            emptyCommitsUndefined
            inputClass={inputClass}
            enterBehavior="focus-next"
            focusRootSelector="[data-node-editor-root]"
            stopPointerPropagation
            oncommit={nextValue => updateItem(index, nextValue)}
          />
        {/if}
      </div>
    {/each}
  </div>
</FieldLayout>
