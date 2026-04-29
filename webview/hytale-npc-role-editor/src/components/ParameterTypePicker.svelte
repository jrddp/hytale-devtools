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
  let filterQuery = $state("");

  const visibleOptions = $derived.by(() => {
    const normalizedQuery = filterQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return STANDARD_PARAMETER_EDITOR_TYPE_OPTIONS;
    }

    const startsWithMatches = STANDARD_PARAMETER_EDITOR_TYPE_OPTIONS.filter(option =>
      option.label.toLowerCase().startsWith(normalizedQuery),
    );
    if (startsWithMatches.length > 0) {
      return startsWithMatches;
    }

    return STANDARD_PARAMETER_EDITOR_TYPE_OPTIONS.filter(option =>
      option.label.toLowerCase().includes(normalizedQuery),
    );
  });

  function focusCurrentOrFirst() {
    const target =
      filterQuery.trim().length > 0
        ? menuElement?.querySelector<HTMLButtonElement>("button")
        : (menuElement?.querySelector<HTMLButtonElement>(
            `[data-parameter-type="${currentType}"]`,
          ) ?? menuElement?.querySelector<HTMLButtonElement>("button"));
    target?.focus();
  }

  function scrollFocusedButtonIntoView() {
    const focusedButton =
      document.activeElement instanceof HTMLButtonElement &&
      menuElement?.contains(document.activeElement)
        ? document.activeElement
        : null;
    focusedButton?.scrollIntoView({ block: "nearest" });
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
    void visibleOptions;
    queueMicrotask(() => {
      focusCurrentOrFirst();
      scrollFocusedButtonIntoView();
    });
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

      if (event.key === "Enter" || event.key === "Tab") {
        const target =
          document.activeElement instanceof HTMLButtonElement &&
          menuElement?.contains(document.activeElement)
            ? document.activeElement
            : menuElement?.querySelector<HTMLButtonElement>("button");
        event.preventDefault();
        target?.click();
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        filterQuery = filterQuery.slice(0, -1);
        return;
      }

      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        filterQuery += event.key;
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        if (event.key === "Home") {
          const firstButton = menuElement?.querySelector<HTMLButtonElement>("button");
          if (!firstButton) {
            return;
          }

          event.preventDefault();
          firstButton.focus();
          queueMicrotask(scrollFocusedButtonIntoView);
        }

        if (event.key === "End") {
          const buttons = Array.from(menuElement?.querySelectorAll<HTMLButtonElement>("button") ?? []);
          const lastButton = buttons.at(-1);
          if (!lastButton) {
            return;
          }

          event.preventDefault();
          lastButton.focus();
          queueMicrotask(scrollFocusedButtonIntoView);
        }

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
      queueMicrotask(scrollFocusedButtonIntoView);
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
  {#if visibleOptions.length > 0}
    {#each visibleOptions as option (option.value)}
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
  {:else}
    <div class="px-3 py-1.5 text-sm text-vsc-muted">
      No parameter types match.
    </div>
  {/if}
</div>
