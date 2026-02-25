<script lang="ts">
  import type { NodeField } from "@shared/node-editor/workspaceTypes";

  let {
    schemaKey,
    type,
    label,
    value,
    onchange,
  }: NodeField & { onchange: (value: unknown) => void } = $props();

  const min = 0;
  const max = 100;
  const step = 1;

  const committedNumericValue = $derived(Number.isFinite(Number(value)) ? Number(value) : min);
  const inputId = $derived(`slider-${schemaKey ?? "field"}-${type}`);

  let draftNumericValue = $state(min);
  let hasPendingValue = $state(false);
  let lastInteractionMode = $state<"unknown" | "pointer" | "keyboard">("unknown");

  $effect(() => {
    if (!hasPendingValue) {
      draftNumericValue = committedNumericValue;
    }
  });

  const fieldLabel = $derived(`${label ?? schemaKey ?? "Field"} (${draftNumericValue})`);

  function emitValue(nextValue: number) {
    onchange(nextValue);
  }

  function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
    const parsed = Number(event.currentTarget.value);
    draftNumericValue = Number.isFinite(parsed) ? parsed : min;
    hasPendingValue = draftNumericValue !== committedNumericValue;
  }

  function handlePointerDown() {
    lastInteractionMode = "pointer";
  }

  function handleKeyDown(event: KeyboardEvent) {
    const navigationKeys = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
      "PageUp",
      "PageDown",
    ];
    if (navigationKeys.includes(event.key)) {
      lastInteractionMode = "keyboard";
    }
  }

  function commitPendingValue() {
    if (!hasPendingValue) {
      return;
    }

    emitValue(draftNumericValue);
    hasPendingValue = false;
  }

  function handleChange() {
    if (lastInteractionMode === "pointer") {
      commitPendingValue();
    }
  }

  function handleBlur() {
    commitPendingValue();
    lastInteractionMode = "unknown";
  }
</script>

<div class="flex flex-col gap-1">
  <label class="text-xs text-vsc-muted" for={inputId}>{fieldLabel}</label>
  <input
    id={inputId}
    class="nodrag w-full"
    type="range"
    {min}
    {max}
    {step}
    value={draftNumericValue}
    onpointerdown={handlePointerDown}
    oninput={handleInput}
    onchange={handleChange}
    onkeydown={handleKeyDown}
    onblur={handleBlur}
  />
</div>
