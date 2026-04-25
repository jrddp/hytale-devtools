<script lang="ts">
  import {
    autoUpdate,
    computePosition,
    flip,
    offset,
    shift,
  } from "@floating-ui/dom";
  import { Check, CircleEllipsis, CircleX, Plus } from "lucide-svelte";
  import HoverTooltip from "@node-editor/components/HoverTooltip.svelte";
  import type { FieldProps } from "@node-editor/node-editor/utils/fieldUtils";
  import { noMousePropogation } from "@node-editor/node-editor/utils/fieldUtils";
  import { useNodeEditorSession } from "@node-editor/workspace.svelte";
  import type { IndexReference } from "@shared/indexTypes";
  import {
    addParameterMapListItem,
    coerceParameterMapValue,
    getParameterMapValueType,
    isComputeParameterMapValue,
    isCompatiblePreferredParameterMapValueType,
    isParameterMap,
    PARAMETER_MAP_TYPE_OPTIONS,
    removeParameterMapListItem,
    updateParameterMapListItem,
    updateParameterMapRangeEndpoint,
    type ParameterMapListValueType,
    type ParameterMapValueType,
  } from "@shared/node-editor/parameterMap";
  import { cloneJsonLike } from "@shared/jsonClone";
  import CommitNumberInput from "../../../shared/components/inputs/CommitNumberInput.svelte";
  import { focusNextEditable } from "../../../shared/components/inputs/inputCommitBehavior";
  import ComputeAutocompleteInput from "../../../shared/components/ComputeAutocompleteInput.svelte";
  import SingleLineAutocompleteInput from "../../../shared/components/SingleLineAutocompleteInput.svelte";
  import type { Snippet } from "svelte";

  type MenuState = {
    key: string;
    referenceElement: HTMLElement;
  };

  let {
    inputId,
    label,
    description,
    initialValue,
    inputWidth,
    keyOverrideAutocompleteValues,
    keySymbolLookup,
    titleActions,
    onconfirm,
  }: FieldProps<Record<string, unknown>> & {
    keyOverrideAutocompleteValues?: string[];
    keySymbolLookup?: IndexReference;
    titleActions?: Snippet;
  } = $props();

  const workspace = useNodeEditorSession();
  let value = $state<Record<string, unknown>>({});
  let lastSignature = "";
  let typeMenu = $state<MenuState | null>(null);
  let menuElement = $state<HTMLDivElement | null>(null);
  let preferredTypesByKey = $state<Record<string, ParameterMapValueType>>({});

  $effect(() => {
    const nextValue = isParameterMap(initialValue) ? initialValue : {};
    const nextSignature = JSON.stringify(nextValue);
    if (nextSignature !== lastSignature) {
      value = cloneJsonLike($state.snapshot(nextValue));
      lastSignature = nextSignature;
    }
  });

  $effect(() => {
    if (!typeMenu || !menuElement) {
      return;
    }

    const element = menuElement;
    document.body.appendChild(element);

    Object.assign(element.style, {
      position: "fixed",
      top: "0px",
      left: "0px",
      width: "max-content",
      zIndex: "3100",
    });

    function updatePosition() {
      if (!typeMenu) {
        return;
      }

      void computePosition(typeMenu.referenceElement, element, {
        placement: "bottom-start",
        strategy: "fixed",
        middleware: [offset(4), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        Object.assign(element.style, {
          left: `${x}px`,
          top: `${y}px`,
        });
      });
    }

    updatePosition();
    queueMicrotask(() => element.querySelector<HTMLButtonElement>("button")?.focus());

    const cleanupAutoUpdate = autoUpdate(typeMenu.referenceElement, element, updatePosition);

    return () => {
      cleanupAutoUpdate();
      element.remove();
    };
  });

  $effect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && menuElement?.contains(target)) {
        return;
      }
      if (target instanceof Node && typeMenu?.referenceElement.contains(target)) {
        return;
      }
      typeMenu = null;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        typeMenu = null;
      }
    }

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  const entries = $derived(Object.entries(value));
  const usesKeyOverrideAutocomplete = $derived(keyOverrideAutocompleteValues !== undefined);

  $effect(() => {
    const nextPreferredTypes: Record<string, ParameterMapValueType> = {};
    for (const [key, preferredType] of Object.entries(preferredTypesByKey)) {
      if (isCompatiblePreferredParameterMapValueType(value[key], preferredType)) {
        nextPreferredTypes[key] = preferredType;
      }
    }
    if (JSON.stringify(nextPreferredTypes) !== JSON.stringify(preferredTypesByKey)) {
      preferredTypesByKey = nextPreferredTypes;
    }
  });

  function commitValue(nextValue: Record<string, unknown>) {
    const plainValue = cloneJsonLike($state.snapshot(nextValue));
    value = plainValue;
    lastSignature = JSON.stringify(plainValue);
    onconfirm(cloneJsonLike(plainValue));
  }

  function buildKeyInputId(index: number) {
    return `${inputId}-parameter-key-${index}`;
  }

  function buildValueInputId(index: number) {
    return `${inputId}-parameter-value-${index}`;
  }

  function buildListItemInputId(index: number, itemIndex: number) {
    return `${inputId}-parameter-value-${index}-item-${itemIndex}`;
  }

  function getKeyAutocompleteOptions(itemInputId: string) {
    const values = usesKeyOverrideAutocomplete
      ? (keyOverrideAutocompleteValues ?? [])
      : workspace.autocompleteField === itemInputId
        ? workspace.autocompleteValues
        : [];

    return values.map(optionValue => ({ value: optionValue }));
  }

  function requestKeyAutocomplete(itemInputId: string) {
    if (!usesKeyOverrideAutocomplete && keySymbolLookup) {
      workspace.postMessageToHost({
        type: "autocompleteRequest",
        symbolLookup: keySymbolLookup,
        fieldId: itemInputId,
      });
    }
  }

  function addEntry() {
    const key = getUniqueKey("Parameter");
    commitValue({
      ...value,
      [key]: "",
    });
  }

  function removeEntry(key: string) {
    const nextValue = { ...value };
    delete nextValue[key];
    const nextPreferredTypes = { ...preferredTypesByKey };
    delete nextPreferredTypes[key];
    preferredTypesByKey = nextPreferredTypes;
    commitValue(nextValue);
  }

  function renameEntry(previousKey: string, nextKey: string) {
    const normalizedKey = nextKey.trim();
    if (!normalizedKey || normalizedKey === previousKey || Object.hasOwn(value, normalizedKey)) {
      return;
    }

    const nextValue: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      if (key === previousKey) {
        nextValue[normalizedKey] = entryValue;
      } else {
        nextValue[key] = entryValue;
      }
    }
    const nextPreferredTypes = { ...preferredTypesByKey };
    if (Object.hasOwn(nextPreferredTypes, previousKey)) {
      nextPreferredTypes[normalizedKey] = nextPreferredTypes[previousKey];
      delete nextPreferredTypes[previousKey];
      preferredTypesByKey = nextPreferredTypes;
    }
    commitValue(nextValue);
  }

  function updateEntry(key: string, nextEntryValue: unknown) {
    commitValue({
      ...value,
      [key]: nextEntryValue,
    });
  }

  function changeEntryType(key: string, nextType: Exclude<ParameterMapValueType, "unsupported">) {
    preferredTypesByKey = {
      ...preferredTypesByKey,
      [key]: nextType,
    };
    updateEntry(key, coerceParameterMapValue(value[key], nextType));
    typeMenu = null;
  }

  function updateNumberEntry(key: string, nextValue: number | undefined) {
    updateEntry(key, nextValue ?? 0);
  }

  function updateRangeEntry(key: string, index: 0 | 1, nextValue: number | undefined) {
    updateEntry(key, updateParameterMapRangeEndpoint(value[key], index, nextValue ?? 0));
  }

  function addListItem(key: string, listType: ParameterMapListValueType) {
    updateEntry(key, addParameterMapListItem(value[key], listType));
  }

  function removeListItem(key: string, listType: ParameterMapListValueType, index: number) {
    updateEntry(key, removeParameterMapListItem(value[key], listType, index));
  }

  function updateListItem(
    key: string,
    listType: ParameterMapListValueType,
    index: number,
    nextItem: string | number,
  ) {
    updateEntry(key, updateParameterMapListItem(value[key], listType, index, nextItem));
  }

  function getUniqueKey(baseKey: string) {
    let key = baseKey;
    let suffix = 2;
    while (Object.hasOwn(value, key)) {
      key = `${baseKey}${suffix}`;
      suffix += 1;
    }
    return key;
  }

  function openTypeMenu(key: string, event: MouseEvent) {
    event.stopPropagation();
    if (!(event.currentTarget instanceof HTMLElement)) {
      return;
    }

    typeMenu = {
      key,
      referenceElement: event.currentTarget,
    };
  }

  function formatUnsupportedValue(value: unknown) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function isParameterMapListValueType(
    type: ParameterMapValueType,
  ): type is ParameterMapListValueType {
    return type === "stringList" || type === "numberList";
  }

  function getEntryType(key: string, entryValue: unknown): ParameterMapValueType {
    return getParameterMapValueType(entryValue, preferredTypesByKey[key]);
  }

  function handleEnterCommit(input: HTMLInputElement) {
    if (!focusNextEditable(input, "[data-node-editor-root]")) {
      input.blur();
    }
  }
</script>

<div class="col-span-2 flex min-w-0 flex-col gap-1.5" class:w-full={inputWidth === undefined}>
  <div class="flex min-w-0 items-center justify-between gap-2">
    <HoverTooltip text={description} placement="right" wrapperClass="min-w-0">
      <div class="flex min-w-0 items-center gap-1 select-none text-[10px] font-semibold uppercase tracking-[0.18em] text-vsc-muted">
        <span class="truncate">{label}</span>
        {#if titleActions}
          <span class="inline-flex items-center">
            {@render titleActions()}
          </span>
        {/if}
      </div>
    </HoverTooltip>
  </div>

  <div
    id={inputId}
    class="flex min-w-0 flex-col gap-1.5"
    class:w-full={inputWidth === undefined}
    style:width={inputWidth !== undefined ? `${inputWidth}px` : undefined}
  >
    {#if entries.length === 0}
      <div class="rounded-md border border-dashed border-vsc-editor-widget-border px-2 py-1.5 text-xs text-vsc-muted">
        No parameters
      </div>
    {:else}
      <div class="flex flex-col gap-1.5">
        {#each entries as [key, entryValue], index (key)}
          {@const entryType = getEntryType(key, entryValue)}
          <div class="grid grid-cols-[minmax(7rem,0.9fr)_minmax(9rem,1.1fr)_auto] items-start gap-1.5">
            <SingleLineAutocompleteInput
              inputId={buildKeyInputId(index)}
              initialValue={key}
              autocompleteOptions={getKeyAutocompleteOptions(buildKeyInputId(index))}
              inputClass="w-full rounded-md border border-vsc-input-border bg-transparent px-2 py-1.5 text-xs font-semibold text-vsc-input-fg nodrag"
              listClass="nodrag nowheel absolute left-0 right-0 top-full z-50 max-h-32 overflow-auto rounded-t-none rounded-md border border-vsc-input-border bg-vsc-editor-widget-bg shadow-lg"
              optionClass="block w-full cursor-pointer px-2 py-1 text-left text-xs text-vsc-input-fg hover:bg-vsc-list-hover"
              stopPointerPropagation
              onfocus={() => requestKeyAutocomplete(buildKeyInputId(index))}
              oncommit={nextKey => renameEntry(key, nextKey)}
              afterEnterPressed={handleEnterCommit}
            />

            {#if entryType === "compute" && isComputeParameterMapValue(entryValue)}
              <ComputeAutocompleteInput
                inputId={buildValueInputId(index)}
                initialValue={entryValue.Compute}
                autocompleteOptions={workspace.computeAutocompleteOptions}
                inputClass="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 font-mono text-xs text-vsc-input-fg"
                overlayClass="block w-full px-2 py-1.5 font-mono text-xs whitespace-pre"
                listClass="nodrag nowheel absolute left-0 top-full z-40 max-h-32 min-w-full overflow-auto rounded-t-none rounded-md border border-vsc-input-border bg-vsc-editor-widget-bg shadow-lg"
                optionClass="block w-full cursor-pointer px-2 py-1 text-left text-xs text-vsc-input-fg hover:bg-vsc-list-hover"
                oncommit={expression => updateEntry(key, { Compute: expression })}
                {...noMousePropogation}
              />
            {:else if entryType === "boolean"}
              <input
                class="nodrag h-4 w-4 accent-vsc-activity-bar-badge-bg"
                type="checkbox"
                checked={entryValue === true}
                onchange={event => updateEntry(key, event.currentTarget.checked)}
                {...noMousePropogation}
              />
            {:else if entryType === "number"}
              <CommitNumberInput
                inputId={buildValueInputId(index)}
                initialValue={typeof entryValue === "number" ? entryValue : 0}
                emptyValue={0}
                inputClass="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
                enterBehavior="focus-next"
                focusRootSelector="[data-node-editor-root]"
                stopPointerPropagation
                oncommit={nextValue => updateNumberEntry(key, nextValue)}
              />
            {:else if entryType === "range" && Array.isArray(entryValue)}
              <div class="grid grid-cols-2 gap-1">
                <CommitNumberInput
                  inputId={`${buildValueInputId(index)}-range-start`}
                  initialValue={typeof entryValue[0] === "number" ? entryValue[0] : 0}
                  emptyValue={0}
                  inputClass="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
                  enterBehavior="focus-next"
                  focusRootSelector="[data-node-editor-root]"
                  stopPointerPropagation
                  oncommit={nextValue => updateRangeEntry(key, 0, nextValue)}
                />
                <CommitNumberInput
                  inputId={`${buildValueInputId(index)}-range-end`}
                  initialValue={typeof entryValue[1] === "number" ? entryValue[1] : 0}
                  emptyValue={0}
                  inputClass="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
                  enterBehavior="focus-next"
                  focusRootSelector="[data-node-editor-root]"
                  stopPointerPropagation
                  oncommit={nextValue => updateRangeEntry(key, 1, nextValue)}
                />
              </div>
            {:else if isParameterMapListValueType(entryType) && Array.isArray(entryValue)}
              <div class="flex min-w-0 flex-col gap-1">
                {#if entryValue.length === 0}
                  <div class="rounded-md border border-dashed border-vsc-editor-widget-border px-2 py-1.5 text-xs text-vsc-muted">
                    No items
                  </div>
                {:else}
                  {#each entryValue as item, itemIndex (`${key}:${itemIndex}`)}
                    <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
                      {#if entryType === "stringList"}
                        <SingleLineAutocompleteInput
                          inputId={buildListItemInputId(index, itemIndex)}
                          initialValue={typeof item === "string" ? item : String(item ?? "")}
                          autocompleteOptions={[]}
                          inputClass="w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg nodrag"
                          listClass="nodrag nowheel absolute left-0 right-0 top-full z-40 max-h-32 overflow-auto rounded-t-none rounded-md border border-vsc-input-border bg-vsc-editor-widget-bg shadow-lg"
                          optionClass="block w-full cursor-pointer px-2 py-1 text-left text-xs text-vsc-input-fg hover:bg-vsc-list-hover"
                          stopPointerPropagation
                          oncommit={nextItem => updateListItem(key, entryType, itemIndex, nextItem)}
                          afterEnterPressed={handleEnterCommit}
                        />
                      {:else}
                        <CommitNumberInput
                          inputId={buildListItemInputId(index, itemIndex)}
                          initialValue={typeof item === "number" ? item : 0}
                          emptyValue={0}
                          inputClass="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
                          enterBehavior="focus-next"
                          focusRootSelector="[data-node-editor-root]"
                          stopPointerPropagation
                          oncommit={nextItem =>
                            updateListItem(key, entryType, itemIndex, nextItem ?? 0)}
                        />
                      {/if}

                      <button
                        type="button"
                        class="nodrag inline-flex size-6 items-center justify-center rounded-md text-vsc-muted hover:bg-vsc-list-hover hover:text-vsc-input-fg"
                        aria-label={`Remove ${key} item ${itemIndex + 1}`}
                        onclick={() => removeListItem(key, entryType, itemIndex)}
                      >
                        <CircleX size={13} />
                      </button>
                    </div>
                  {/each}
                {/if}

                <button
                  type="button"
                  class="nodrag inline-flex items-center gap-1 rounded-md border border-vsc-button-border bg-vsc-button-secondary-bg px-2 py-1 text-left text-xs text-vsc-button-secondary-fg hover:bg-vsc-button-secondary-hover"
                  onclick={() => addListItem(key, entryType)}
                >
                  <Plus size={12} />
                  Add item
                </button>
              </div>
            {:else if entryType === "unsupported"}
              <input
                class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 font-mono text-xs text-vsc-muted"
                type="text"
                readonly
                value={formatUnsupportedValue(entryValue)}
                title="Unsupported BuilderExpression value; choose a type to replace it."
                {...noMousePropogation}
              />
            {:else}
              <SingleLineAutocompleteInput
                inputId={buildValueInputId(index)}
                initialValue={typeof entryValue === "string" ? entryValue : ""}
                autocompleteOptions={[]}
                inputClass="w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg nodrag"
                listClass="nodrag nowheel absolute left-0 right-0 top-full z-40 max-h-32 overflow-auto rounded-t-none rounded-md border border-vsc-input-border bg-vsc-editor-widget-bg shadow-lg"
                optionClass="block w-full cursor-pointer px-2 py-1 text-left text-xs text-vsc-input-fg hover:bg-vsc-list-hover"
                stopPointerPropagation
                oncommit={nextValue => updateEntry(key, nextValue)}
                afterEnterPressed={handleEnterCommit}
              />
            {/if}

            <div class="flex items-center gap-0.5">
              <button
                type="button"
                class="nodrag inline-flex size-6 items-center justify-center rounded-md text-vsc-muted hover:bg-vsc-list-hover hover:text-vsc-input-fg"
                aria-label={`Change ${key} parameter type`}
                onclick={event => openTypeMenu(key, event)}
              >
                <CircleEllipsis size={14} />
              </button>
              <button
                type="button"
                class="nodrag inline-flex size-6 items-center justify-center rounded-md text-vsc-muted hover:bg-vsc-list-hover hover:text-vsc-input-fg"
                aria-label={`Remove ${key} parameter`}
                onclick={() => removeEntry(key)}
              >
                <CircleX size={14} />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <button
      class="nodrag inline-flex items-center gap-1 self-stretch rounded-md border border-vsc-button-border bg-vsc-button-secondary-bg px-2 py-1 text-left text-xs text-vsc-button-secondary-fg hover:bg-vsc-button-secondary-hover"
      type="button"
      onclick={addEntry}
    >
      <Plus size={13} />
      Add parameter
    </button>
  </div>
</div>

{#if typeMenu}
  {@const currentType = getEntryType(typeMenu.key, value[typeMenu.key])}
  <div
    bind:this={menuElement}
    class="nodrag nowheel fixed z-[3100] min-w-44 overflow-hidden rounded-md border border-vsc-input-border bg-vsc-editor-widget-bg py-1 shadow-lg"
    role="menu"
    tabindex={-1}
    aria-label="Change parameter type"
  >
    {#each PARAMETER_MAP_TYPE_OPTIONS as option (option.value)}
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 px-2 py-1.5 text-left text-xs text-vsc-input-fg hover:bg-vsc-list-hover focus:bg-vsc-list-hover focus:outline-none"
        role="menuitemradio"
        aria-checked={option.value === currentType}
        onclick={() => changeEntryType(typeMenu.key, option.value)}
      >
        <span>{option.label}</span>
        <span class="inline-flex size-4 items-center justify-center text-vsc-muted">
          {#if option.value === currentType}
            <Check size={13} />
          {/if}
        </span>
      </button>
    {/each}
  </div>
{/if}
