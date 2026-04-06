<script lang="ts">
  import { Check } from "lucide-svelte";
  import { tick } from "svelte";
  import {
    STANDARD_PARAMETER_EDITOR_TYPE_OPTIONS,
    type StandardParameterEditableTypeOption,
  } from "../parsing/parameterEditorTypes";

  let {
    x,
    y,
    currentType,
    onselect,
    onclose,
  }: {
    x: number;
    y: number;
    currentType: StandardParameterEditableTypeOption["value"];
    onselect: (value: StandardParameterEditableTypeOption["value"]) => void;
    onclose: () => void;
  } = $props();

  let menuElement = $state<HTMLDivElement | null>(null);
  let left = $state(0);
  let top = $state(0);

  function focusCurrentOrFirst() {
    const target =
      menuElement?.querySelector<HTMLButtonElement>(`[data-parameter-type="${currentType}"]`) ??
      menuElement?.querySelector<HTMLButtonElement>("button");
    target?.focus();
  }

  async function positionMenu() {
    await tick();
    if (!menuElement) {
      return;
    }

    const rect = menuElement.getBoundingClientRect();
    const nextLeft = Math.min(x, window.innerWidth - rect.width - 8);
    const nextTop = Math.min(y, window.innerHeight - rect.height - 8);
    left = Math.max(8, nextLeft);
    top = Math.max(8, nextTop);
    focusCurrentOrFirst();
  }

  $effect(() => {
    void positionMenu();
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

      onclose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onclose();
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }

      const buttons = Array.from(menuElement?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      const activeIndex = buttons.findIndex(button => button === document.activeElement);
      const lastIndex = buttons.length - 1;
      if (lastIndex < 0) {
        return;
      }

      event.preventDefault();

      let nextIndex = activeIndex;
      if (event.key === "ArrowDown") {
        nextIndex = activeIndex < lastIndex ? activeIndex + 1 : 0;
      } else {
        nextIndex = activeIndex > 0 ? activeIndex - 1 : lastIndex;
      }

      buttons[nextIndex]?.focus();
    }

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  });
</script>

<div
  bind:this={menuElement}
  class="fixed z-[3100] min-w-52 overflow-hidden rounded-md border border-vsc-border bg-vsc-editor-widget-bg py-1 shadow-lg"
  style:left={`${left}px`}
  style:top={`${top}px`}
  role="menu"
  tabindex={-1}
  aria-label="Change parameter type"
>
  {#each STANDARD_PARAMETER_EDITOR_TYPE_OPTIONS as option (option.value)}
    <button
      type="button"
      data-parameter-type={option.value}
      class="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm text-vsc-input-fg hover:bg-vsc-list-hover focus:bg-vsc-list-hover focus:outline-none"
      role="menuitemradio"
      aria-checked={option.value === currentType}
      onclick={() => onselect(option.value)}
    >
      <span>{option.label}</span>
      <span class="inline-flex size-4 items-center justify-center text-vsc-muted">
        {#if option.value === currentType}
          <Check size={14} />
        {/if}
      </span>
    </button>
  {/each}
</div>
