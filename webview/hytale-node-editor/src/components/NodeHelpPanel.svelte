<script lang="ts">
  import { CircleQuestionMark } from "lucide-svelte";
  import { workspace } from "src/workspace.svelte";
  import { onMount } from "svelte";

  const { onclose }: { onclose: () => void } = $props();

  type KeybindingRow = {
    label: string;
    defaultKeybindings: { win: string; linux: string; mac: string }[] | string[];
  };

  const QUICK_ACTION_ROWS: KeybindingRow[] = [
    {
      label: "Search nodes",
      defaultKeybindings: ["F"],
    },
    {
      label: "Fit full view",
      defaultKeybindings: ["V"],
    },
    {
      label: "Auto position nodes",
      defaultKeybindings: ["L"],
    },
    {
      label: "Show help",
      defaultKeybindings: ["?"],
    },
  ];

  const ADD_NODE_ACTION_ROW: KeybindingRow = {
    label: "Add node",
    defaultKeybindings: ["Right click"],
  };

  const NAVIGATION_ROWS: KeybindingRow[] = $derived([
    {
      label: "Pan canvas",
      defaultKeybindings: workspace.controlScheme === "mouse" ? ["Drag"] : ["Scroll"],
    },
    {
      label: "Zoom",
      defaultKeybindings: workspace.controlScheme === "mouse" ? ["Scroll"] : ["Pinch"],
    },
    {
      label: "Box select",
      defaultKeybindings: workspace.controlScheme === "mouse" ? ["Shift+Drag"] : ["Drag"],
    },
  ]);

  const STANDARD_EDIT_ROWS: KeybindingRow[] = [
    {
      label: "Undo",
      defaultKeybindings: [{ win: "Ctrl+Z", linux: "Ctrl+Z", mac: "Cmd+Z" }],
    },
    {
      label: "Redo",
      defaultKeybindings: [{ win: "Ctrl+Y", linux: "Ctrl+Y", mac: "Shift+Cmd+Z" }],
    },
    {
      label: "Copy",
      defaultKeybindings: [{ win: "Ctrl+C", linux: "Ctrl+C", mac: "Cmd+C" }],
    },
    {
      label: "Cut",
      defaultKeybindings: [{ win: "Ctrl+X", linux: "Ctrl+X", mac: "Cmd+X" }],
    },
    {
      label: "Paste",
      defaultKeybindings: [{ win: "Ctrl+V", linux: "Ctrl+V", mac: "Cmd+V" }],
    },
  ];

  let panelElement: HTMLDivElement | undefined = $state();

  onMount(() => {
    panelElement.focus();
  });
</script>

<div
  data-node-help-overlay="true"
  class="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/15"
>
  <button
    type="button"
    aria-label="Close help"
    class="absolute inset-0 p-0 bg-transparent border-0"
    onpointerdown={onclose}
  ></button>
  <div
    bind:this={panelElement}
    role="dialog"
    aria-modal="true"
    aria-label="Default Keybinds"
    tabindex="-1"
    class="relative w-120 max-w-[96vw] overflow-auto rounded-xl border border-vsc-editor-widget-border bg-vsc-editor-widget-bg p-3 text-vsc-editor-fg shadow-2xl outline-none focus:outline-none focus-visible:outline-none"
    onpointerdown={event => event.stopPropagation()}
  >
    <div class="flex items-center justify-between gap-2 mb-3">
      <div class="flex items-center gap-2">
        <CircleQuestionMark aria-hidden="true" size={15} strokeWidth={2} class="text-vsc-muted" />
        <h2 class="text-sm font-semibold">Default Keybinds</h2>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-md border border-vsc-input-border bg-vsc-button-secondary-bg px-2 py-1 text-[0.7rem] font-medium text-vsc-button-secondary-fg hover:bg-vsc-button-secondary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
        onclick={onclose}
      >
        Close
      </button>
    </div>

    <div class="flex flex-col gap-4">
      <section
        class="rounded-lg border border-vsc-editor-widget-border bg-vsc-button-secondary-bg p-2.5"
      >
        <h3 class="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-vsc-muted">
          Editing
        </h3>
        <div class="grid gap-2">
          {#each STANDARD_EDIT_ROWS as row}
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs">{row.label}</span>
              <div class="flex flex-wrap items-center gap-1">
                {#each row.defaultKeybindings as combo, comboIndex}
                  {@const comboStr = typeof combo === "string" ? combo : combo[workspace.platform]}
                  {@const keyTokens = comboStr.split("+")}
                  <span class="inline-flex items-center gap-1">
                    {#each keyTokens as keyToken, keyIndex}
                      <kbd
                        class="rounded border border-vsc-editor-widget-border bg-vsc-input-bg px-1.5 py-0 text-[0.65rem] leading-4 text-vsc-input-fg"
                      >
                        {keyToken}
                      </kbd>
                    {/each}
                  </span>
                  {#if comboIndex < row.defaultKeybindings.length - 1}
                    <span class="px-1 text-[0.65rem] text-vsc-muted">or</span>
                  {/if}
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </section>

      <section
        class="rounded-lg border border-vsc-editor-widget-border bg-vsc-button-secondary-bg p-2.5"
      >
        <div class="flex items-center justify-between gap-3 mb-2">
          <h3 class="text-[0.65rem] font-semibold uppercase tracking-widest text-vsc-muted">
            Navigation
          </h3>
          <div class="flex items-center gap-2">
            <h4 class="text-xs text-vsc-muted">Control Scheme:</h4>
            <div class="flex items-center">
              <button
                type="button"
                class="rounded-r-none inline-flex items-center rounded-md border border-vsc-button-secondary-fg bg-vsc-button-secondary-bg px-2 py-1 text-[0.7rem] font-medium text-vsc-button-secondary-fg hover:bg-vsc-button-secondary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
                class:bg-vsc-list-active-bg={workspace.controlScheme === "mouse"}
                class:hover:bg-vsc-list-active-bg={workspace.controlScheme === "mouse"}
                class:text-vsc-list-active-fg={workspace.controlScheme === "mouse"}
                onclick={() => workspace.updateControlSchemeSetting("mouse")}
              >
                Mouse
              </button>
              <button
                type="button"
                class="rounded-l-none inline-flex items-center rounded-md border border-vsc-button-secondary-fg bg-vsc-button-secondary-bg px-2 py-1 text-[0.7rem] font-medium text-vsc-button-secondary-fg hover:bg-vsc-button-secondary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
                class:bg-vsc-list-active-bg={workspace.controlScheme === "trackpad"}
                class:hover:bg-vsc-list-active-bg={workspace.controlScheme === "trackpad"}
                class:text-vsc-list-active-fg={workspace.controlScheme === "trackpad"}
                onclick={() => workspace.updateControlSchemeSetting("trackpad")}
              >
                Trackpad
              </button>
            </div>
          </div>
        </div>
        <div class="grid gap-2">
          {#each NAVIGATION_ROWS as row}
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs">{row.label}</span>
              <div class="flex flex-wrap items-center gap-1">
                {#each row.defaultKeybindings as combo, comboIndex}
                  {@const comboStr = typeof combo === "string" ? combo : combo[workspace.platform]}
                  {@const keyTokens = comboStr.split("+")}
                  <span class="inline-flex items-center gap-1">
                    {#each keyTokens as keyToken, keyIndex}
                      <kbd
                        class="rounded border border-vsc-editor-widget-border bg-vsc-input-bg px-1.5 py-0 text-[0.65rem] leading-4 text-vsc-input-fg"
                      >
                        {keyToken}
                      </kbd>
                      {#if keyIndex < keyTokens.length - 1}
                        <span class="text-[0.65rem] text-vsc-muted">+</span>
                      {/if}
                    {/each}
                  </span>
                  {#if comboIndex < row.defaultKeybindings.length - 1}
                    <span class="px-1 text-[0.65rem] text-vsc-muted">or</span>
                  {/if}
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </section>

      <section
        class="rounded-lg border border-vsc-editor-widget-border bg-vsc-button-secondary-bg p-2.5"
      >
        <h3 class="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-vsc-muted">
          Actions
        </h3>
        <div class="grid gap-2">
          {#each QUICK_ACTION_ROWS as row}
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs">{row.label}</span>
              <div class="flex flex-wrap items-center gap-1">
                {#each row.defaultKeybindings as combo, comboIndex}
                  {@const comboStr = typeof combo === "string" ? combo : combo[workspace.platform]}
                  {@const keyTokens = comboStr.split("+")}
                  <span class="inline-flex items-center gap-1">
                    {#each keyTokens as keyToken, keyIndex}
                      <kbd
                        class="rounded border border-vsc-editor-widget-border bg-vsc-input-bg px-1.5 py-0 text-[0.65rem] leading-4 text-vsc-input-fg"
                      >
                        {keyToken}
                      </kbd>
                      {#if keyIndex < keyTokens.length - 1}
                        <span class="text-[0.65rem] text-vsc-muted">+</span>
                      {/if}
                    {/each}
                  </span>
                  {#if comboIndex < row.defaultKeybindings.length - 1}
                    <span class="px-1 text-[0.65rem] text-vsc-muted">or</span>
                  {/if}
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </section>
    </div>

    <div
      class="flex flex-wrap items-center justify-between gap-2 pt-2 mt-3 border-t border-vsc-editor-widget-border"
    >
      <p class="text-[0.65rem] text-vsc-muted">
        Keybinds can be customized. These are the default.
      </p>
      <button
        type="button"
        class="inline-flex items-center rounded-md border border-vsc-input-border bg-vsc-button-secondary-bg px-2 py-1 text-[0.7rem] font-medium text-vsc-button-secondary-fg hover:bg-vsc-button-secondary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
        onclick={() =>
          workspace.vscode.postMessage({ type: "openKeybindings", query: "Hytale Node Editor" })}
      >
        Customize
      </button>
    </div>
  </div>
</div>
