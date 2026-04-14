<script lang="ts">
  import { tick } from "svelte";
  import { Plus } from "lucide-svelte";

  export type AddSearchMenuItem = {
    id: string;
    label: string;
    summary?: string;
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

  const filteredItems = $derived.by(() => {
    const trimmedSearch = searchValue.trim().toLowerCase();
    if (!trimmedSearch) {
      return items;
    }

    return items.filter(item =>
      item.label.toLowerCase().includes(trimmedSearch) ||
      (item.summary?.toLowerCase().includes(trimmedSearch) ?? false),
    );
  });

  async function openMenu() {
    if (disabled) {
      return;
    }

    menuOpen = true;
    searchValue = "";
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
</script>

<svelte:window
  onkeydown={event => {
    if (event.key === "Escape" && menuOpen) {
      closeMenu();
    }
  }}
/>

<div class="space-y-2">
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
        onkeydown={event => {
          if (event.key === "Enter") {
            event.preventDefault();
            const firstItem = filteredItems[0];
            if (firstItem) {
              selectItem(firstItem);
            }
          }
        }}
      />

      <div class="max-h-64 space-y-1 overflow-auto">
        {#if filteredItems.length > 0}
          {#each filteredItems as item (item.id)}
            <button
              type="button"
              class="flex w-full flex-col rounded-md border border-transparent px-3 py-2 text-left hover:bg-vsc-list-hover"
              onclick={() => selectItem(item)}
            >
              <div class="text-sm font-medium text-vsc-input-fg">{item.label}</div>
              {#if item.summary}
                <div class="truncate text-xs text-vsc-muted">{item.summary}</div>
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
