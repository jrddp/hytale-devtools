<script lang="ts">
  import { tick } from "svelte";
  import { Plus } from "lucide-svelte";

  export type AddSearchMenuItem = {
    id: string;
    label: string;
    summary?: string;
    keywords?: string[];
  };

  let {
    buttonLabel,
    disabled = false,
    helperText,
    searchPlaceholder,
    emptyText,
    items,
    onselect,
  }: {
    buttonLabel: string;
    disabled?: boolean;
    helperText?: string | null;
    searchPlaceholder: string;
    emptyText: string;
    items: AddSearchMenuItem[];
    onselect: (item: AddSearchMenuItem) => void;
  } = $props();

  let menuOpen = $state(false);
  let searchValue = $state("");
  let searchInput = $state<HTMLInputElement>();
  let rootElement = $state<HTMLDivElement>();
  let activeIndex = $state(0);

  const filteredItems = $derived.by(() => {
    const trimmedSearch = searchValue.trim().toLowerCase();
    if (!trimmedSearch) {
      return items;
    }

    return items.filter(item =>
      item.label.toLowerCase().includes(trimmedSearch) ||
      (item.summary?.toLowerCase().includes(trimmedSearch) ?? false) ||
      (item.keywords?.some(keyword => keyword.toLowerCase().includes(trimmedSearch)) ?? false),
    );
  });

  $effect(() => {
    if (!menuOpen) {
      return;
    }

    if (filteredItems.length === 0) {
      if (activeIndex !== 0) {
        activeIndex = 0;
      }
      return;
    }

    if (activeIndex >= filteredItems.length) {
      activeIndex = filteredItems.length - 1;
    }
  });

  async function openMenu() {
    if (disabled) {
      return;
    }

    menuOpen = true;
    searchValue = "";
    activeIndex = 0;
    await tick();
    searchInput?.focus();
  }

  function closeMenu() {
    menuOpen = false;
    searchValue = "";
  }

  function selectItem(item: AddSearchMenuItem) {
    onselect(item);
    closeMenu();
  }

  function moveActiveIndex(offset: number) {
    if (filteredItems.length === 0) {
      return;
    }

    activeIndex = (activeIndex + offset + filteredItems.length) % filteredItems.length;
  }
</script>

<svelte:window
  onmousedown={event => {
    if (!menuOpen || !rootElement) {
      return;
    }

    if (!rootElement.contains(event.target as Node)) {
      closeMenu();
    }
  }}
  onkeydown={event => {
    if (event.key === "Escape" && menuOpen) {
      closeMenu();
    }
  }}
/>

<div bind:this={rootElement} class="space-y-2">
  <button
    type="button"
    class="flex w-full items-center gap-1 rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg opacity-80 hover:bg-vsc-button-hover disabled:cursor-not-allowed disabled:opacity-50"
    {disabled}
    onclick={openMenu}
  >
    <Plus size={14} />
    {buttonLabel}
  </button>

  {#if helperText}
    <div class="text-xs text-vsc-muted">{helperText}</div>
  {/if}

  {#if menuOpen}
    <div class="space-y-2 rounded-md border border-vsc-border bg-vsc-panel px-3 py-3">
      <input
        bind:this={searchInput}
        bind:value={searchValue}
        class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
        data-vscode-context={"{}"}
        placeholder={searchPlaceholder}
        oninput={() => {
          activeIndex = 0;
        }}
        onkeydown={event => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveActiveIndex(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            moveActiveIndex(-1);
          } else if (event.key === "Enter") {
            event.preventDefault();
            const activeItem = filteredItems[activeIndex] ?? filteredItems[0];
            if (activeItem) {
              selectItem(activeItem);
            }
          }
        }}
      />

      <div class="max-h-64 space-y-1 overflow-auto">
        {#if filteredItems.length > 0}
          {#each filteredItems as item, index (item.id)}
            <button
              type="button"
              class="flex w-full items-baseline gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-left hover:bg-vsc-list-hover"
              class:bg-vsc-list-hover={index === activeIndex}
              onmouseenter={() => {
                activeIndex = index;
              }}
              onclick={() => selectItem(item)}
            >
              <div class="shrink-0 text-xs font-medium text-vsc-input-fg">{item.label}</div>
              {#if item.summary}
                <div class="min-w-0 truncate text-xs text-vsc-muted">: {item.summary}</div>
              {/if}
            </button>
          {/each}
        {:else}
          <div class="px-1 py-2 text-xs text-vsc-muted">{emptyText}</div>
        {/if}
      </div>
    </div>
  {/if}
</div>
