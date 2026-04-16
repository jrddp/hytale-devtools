<script lang="ts">
  import type { Snippet } from "svelte";
  import { fade } from "svelte/transition";

  let {
    title,
    subtitle,
    path,
    actions,
    sidebar,
    children,
    scrollRootElement = $bindable(),
    sidebarClass = "space-y-4 lg:sticky lg:top-4",
    mainClass = "min-w-0",
  }: {
    title: string;
    subtitle: string;
    path: string;
    actions?: Snippet;
    sidebar: Snippet;
    children: Snippet;
    scrollRootElement?: HTMLDivElement;
    sidebarClass?: string;
    mainClass?: string;
  } = $props();
</script>

<main
  class="flex h-screen min-h-0 flex-col bg-vsc-bg text-sm text-vsc-editor-fg"
  in:fade={{ duration: 50 }}
>
  <header
    class="flex items-center justify-between gap-3 border-b border-vsc-border bg-vsc-panel px-4 py-3"
  >
    <div class="min-w-0">
      <div class="space-x-1">
        <span class="truncate text-lg font-semibold">{title}</span>
        <span class="text-xs italic font-normal text-vsc-muted">{subtitle}</span>
      </div>
      <div class="mt-1 truncate text-xs text-vsc-muted">
        {path || "Waiting for document..."}
      </div>
    </div>

    {#if actions}
      <div class="flex items-center gap-2">
        {@render actions()}
      </div>
    {/if}
  </header>

  <div
    bind:this={scrollRootElement}
    class="flex-1 min-h-0 overflow-auto"
    data-sticky-scroll-root
    style="overflow-anchor: none;"
  >
    <div class="p-4">
      <div class="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside class={sidebarClass}>
          {@render sidebar()}
        </aside>

        <div class={mainClass}>
          {@render children()}
        </div>
      </div>
    </div>
  </div>
</main>
