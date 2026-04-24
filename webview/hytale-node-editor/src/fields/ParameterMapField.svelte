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
    coerceParameterMapValue,
    getParameterMapValueType,
    isComputeParameterMapValue,
    isParameterMap,
    PARAMETER_MAP_TYPE_OPTIONS,
    type ParameterMapValueType,
  } from "@shared/node-editor/parameterMap";
  import { cloneJsonLike } from "@shared/jsonClone";
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
    commitValue(nextValue);
  }

  function updateEntry(key: string, nextEntryValue: unknown) {
    commitValue({
      ...value,
      [key]: nextEntryValue,
    });
  }

  function changeEntryType(key: string, nextType: Exclude<ParameterMapValueType, "unsupported">) {
    updateEntry(key, coerceParameterMapValue(value[key], nextType));
    typeMenu = null;
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

  function sanitizeNumber(value: string) {
    return value
      .trim()
      .replace(/[^\d.-]/g, "")
      .replace(/(?!^)-/g, "")
      .replace(/(\..*)\./g, "$1");
  }

  function updateNumberEntry(key: string, nextText: string) {
    const parsed = Number(sanitizeNumber(nextText));
    updateEntry(key, Number.isFinite(parsed) ? parsed : 0);
  }

  function updateListEntry(
    key: string,
    nextText: string,
    itemType: "string" | "number" | "boolean",
  ) {
    try {
      const parsed = JSON.parse(nextText);
      if (!Array.isArray(parsed)) {
        return;
      }
      if (itemType === "string" && parsed.every(item => typeof item === "string")) {
        updateEntry(key, parsed);
      }
      if (itemType === "number" && parsed.every(item => typeof item === "number")) {
        updateEntry(key, parsed);
      }
      if (itemType === "boolean" && parsed.every(item => typeof item === "boolean")) {
        updateEntry(key, parsed);
      }
    } catch {
      // Keep the draft visible until it becomes valid JSON.
    }
  }

  function formatListValue(value: unknown) {
    return JSON.stringify(Array.isArray(value) ? value : []);
  }

  function formatUnsupportedValue(value: unknown) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
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
          {@const entryType = getParameterMapValueType(entryValue)}
          <div class="grid grid-cols-[minmax(7rem,0.9fr)_minmax(9rem,1.1fr)_auto] items-center gap-1.5">
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
              <input
                class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
                type="text"
                inputmode="decimal"
                value={typeof entryValue === "number" ? String(entryValue) : "0"}
                onblur={event => updateNumberEntry(key, event.currentTarget.value)}
                onkeydown={event => {
                  if (event.key === "Enter" || event.key === "Escape") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                {...noMousePropogation}
              />
            {:else if entryType === "range" && Array.isArray(entryValue)}
              <div class="grid grid-cols-2 gap-1">
                <input
                  class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
                  type="text"
                  inputmode="decimal"
                  value={typeof entryValue[0] === "number" ? String(entryValue[0]) : "0"}
                  onblur={event => {
                    const next = [...entryValue] as number[];
                    const parsed = Number(sanitizeNumber(event.currentTarget.value));
                    next[0] = Number.isFinite(parsed) ? parsed : 0;
                    updateEntry(key, next);
                  }}
                  {...noMousePropogation}
                />
                <input
                  class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
                  type="text"
                  inputmode="decimal"
                  value={typeof entryValue[1] === "number" ? String(entryValue[1]) : "0"}
                  onblur={event => {
                    const next = [...entryValue] as number[];
                    const parsed = Number(sanitizeNumber(event.currentTarget.value));
                    next[1] = Number.isFinite(parsed) ? parsed : 0;
                    updateEntry(key, next);
                  }}
                  {...noMousePropogation}
                />
              </div>
            {:else if entryType === "stringList" || entryType === "numberList" || entryType === "booleanList"}
              <input
                class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 font-mono text-xs text-vsc-input-fg"
                type="text"
                value={formatListValue(entryValue)}
                onblur={event =>
                  updateListEntry(
                    key,
                    event.currentTarget.value,
                    entryType === "numberList" ? "number" : entryType === "booleanList" ? "boolean" : "string",
                  )}
                {...noMousePropogation}
              />
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
              <input
                class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
                type="text"
                value={typeof entryValue === "string" ? entryValue : ""}
                onblur={event => updateEntry(key, event.currentTarget.value)}
                onkeydown={event => {
                  if (event.key === "Enter" || event.key === "Escape") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                {...noMousePropogation}
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
  {@const currentType = getParameterMapValueType(value[typeMenu.key])}
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
