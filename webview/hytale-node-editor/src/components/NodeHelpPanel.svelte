<script lang="ts">
  import { createEventDispatcher, tick } from "svelte";
  import { CircleQuestionMark } from "lucide-svelte";
  import {
    NODE_EDITOR_QUICK_ACTION_IDS,
    NODE_EDITOR_QUICK_ACTIONS,
  } from "../node-editor/ui/nodeEditorQuickActions";

  export let open = false;
  export let openVersion = 0;

  const dispatch = createEventDispatcher();
  const QUICK_ACTION_DISPLAY_ORDER = [
    NODE_EDITOR_QUICK_ACTION_IDS.SEARCH_NODES,
    NODE_EDITOR_QUICK_ACTION_IDS.FIT_FULL_VIEW,
    NODE_EDITOR_QUICK_ACTION_IDS.AUTO_POSITION_NODES,
    NODE_EDITOR_QUICK_ACTION_IDS.HELP_AND_HOTKEYS,
  ];
  const ADD_NODE_ACTION_ROW = {
    label: "Add node",
    combos: [["Right click"]],
  };
  const NAVIGATION_ROWS = [
    {
      label: "Pan canvas",
      combos: [["Shift", "Scroll"]],
    },
    {
      label: "Box select",
      combos: [["Shift", "Drag"]],
    },
  ];
  const MAC_STANDARD_EDIT_ROWS = [
    {
      label: "Undo",
      combos: [["Cmd", "Z"]],
    },
    {
      label: "Redo",
      combos: [["Shift", "Cmd", "Z"]],
    },
    {
      label: "Copy",
      combos: [["Cmd", "C"]],
    },
    {
      label: "Cut",
      combos: [["Cmd", "X"]],
    },
    {
      label: "Paste",
      combos: [["Cmd", "V"]],
    },
  ];
  const DEFAULT_STANDARD_EDIT_ROWS = [
    {
      label: "Undo",
      combos: [["Ctrl", "Z"]],
    },
    {
      label: "Redo",
      combos: [["Ctrl", "Y"], ["Ctrl", "Shift", "Z"]],
    },
    {
      label: "Copy",
      combos: [["Ctrl", "C"]],
    },
    {
      label: "Cut",
      combos: [["Ctrl", "X"]],
    },
    {
      label: "Paste",
      combos: [["Ctrl", "V"]],
    },
  ];

  let panelElement;
  let lastFocusedOpenVersion = -1;

  $: platform = detectPlatform();
  $: actionRows = [ADD_NODE_ACTION_ROW, ...buildQuickActionRows(platform)];
  $: standardEditRows = platform === "mac" ? MAC_STANDARD_EDIT_ROWS : DEFAULT_STANDARD_EDIT_ROWS;

  $: if (open && openVersion !== lastFocusedOpenVersion) {
    lastFocusedOpenVersion = openVersion;
    tick().then(() => panelElement?.focus());
  }

  function handleCloseRequest() {
    dispatch("close");
  }

  function handleBackdropPointerDown() {
    handleCloseRequest();
  }

  function handleCustomizeKeybindsRequest() {
    dispatch("customizekeybinds");
  }

  function buildQuickActionRows(targetPlatform) {
    const actionsById = new Map(
      NODE_EDITOR_QUICK_ACTIONS.map((quickAction) => [quickAction.id, quickAction])
    );

    return QUICK_ACTION_DISPLAY_ORDER
      .map((quickActionId) => actionsById.get(quickActionId))
      .filter(Boolean)
      .map((quickAction) => ({
        label: quickAction.name,
        combos: [readDefaultKeybindingTokens(quickAction, targetPlatform)].filter(
          (combo) => Array.isArray(combo) && combo.length > 0
        ),
      }))
      .filter((row) => row.combos.length > 0);
  }

  function readDefaultKeybindingTokens(quickAction, targetPlatform) {
    const defaultKeybinding = quickAction?.defaultKeybinding;
    if (!defaultKeybinding) {
      return [];
    }

    const platformKeybinding =
      targetPlatform === "mac"
        ? defaultKeybinding.mac
        : targetPlatform === "linux"
          ? defaultKeybinding.linux
          : defaultKeybinding.win;
    return readShortcutTokens(platformKeybinding);
  }

  function readShortcutTokens(shortcutCandidate) {
    const shortcut = readString(shortcutCandidate);
    if (!shortcut) {
      return [];
    }

    return shortcut
      .split("+")
      .map((keyToken) => readString(keyToken))
      .filter(Boolean);
  }

  function detectPlatform() {
    const sourcePlatform =
      readString(globalThis?.navigator?.userAgentData?.platform) ??
      readString(globalThis?.navigator?.platform) ??
      "";
    const platform = sourcePlatform.toLowerCase();
    if (platform.includes("mac")) {
      return "mac";
    }

    if (platform.includes("linux")) {
      return "linux";
    }

    return "win";
  }

  function readString(value) {
    return typeof value === "string" ? value : undefined;
  }
</script>

{#if open}
  <div
    data-node-help-overlay="true"
    class="absolute inset-0 z-50 flex items-center justify-center bg-black/15 p-4"
  >
    <button
      type="button"
      aria-label="Close help"
      class="absolute inset-0 border-0 bg-transparent p-0"
      onpointerdown={handleBackdropPointerDown}
    ></button>
    <div
      bind:this={panelElement}
      role="dialog"
      aria-modal="true"
      aria-label="Default Keybinds"
      tabindex="-1"
      class="relative w-[30rem] max-h-[72vh] max-w-[96vw] overflow-auto rounded-xl border border-vsc-editor-widget-border bg-vsc-editor-widget-bg p-3 text-vsc-editor-fg shadow-2xl outline-none focus:outline-none focus-visible:outline-none"
      onpointerdown={(event) => event.stopPropagation()}
    >
      <div class="mb-3 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <CircleQuestionMark aria-hidden="true" size={15} strokeWidth={2} class="text-vsc-muted" />
          <h2 class="text-sm font-semibold">Default Keybinds</h2>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-md border border-vsc-input-border bg-vsc-button-secondary-bg px-2 py-1 text-[0.7rem] font-medium text-vsc-button-secondary-fg hover:bg-vsc-button-secondary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
          onclick={handleCloseRequest}
        >
          Close
        </button>
      </div>

      <div class="flex flex-col gap-4">
        <section class="rounded-lg border border-vsc-editor-widget-border bg-vsc-button-secondary-bg p-2.5">
          <h3 class="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-vsc-muted">Editing</h3>
          <div class="grid gap-2">
            {#each standardEditRows as row}
              <div class="flex items-center justify-between gap-3">
                <span class="text-xs">{row.label}</span>
                <div class="flex flex-wrap items-center gap-1">
                  {#each row.combos as combo, comboIndex}
                    <span class="inline-flex items-center gap-1">
                      {#each combo as keyToken, keyIndex}
                        <kbd class="rounded border border-vsc-editor-widget-border bg-vsc-input-bg px-1.5 py-0 text-[0.65rem] leading-4 text-vsc-input-fg">
                          {keyToken}
                        </kbd>
                        {#if keyIndex < combo.length - 1}
                          <span class="text-[0.65rem] text-vsc-muted">+</span>
                        {/if}
                      {/each}
                    </span>
                    {#if comboIndex < row.combos.length - 1}
                      <span class="px-1 text-[0.65rem] text-vsc-muted">or</span>
                    {/if}
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </section>

        <section class="rounded-lg border border-vsc-editor-widget-border bg-vsc-button-secondary-bg p-2.5">
          <h3 class="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-vsc-muted">Navigation</h3>
          <div class="grid gap-2">
            {#each NAVIGATION_ROWS as row}
              <div class="flex items-center justify-between gap-3">
                <span class="text-xs">{row.label}</span>
                <div class="flex flex-wrap items-center gap-1">
                  {#each row.combos as combo, comboIndex}
                    <span class="inline-flex items-center gap-1">
                      {#each combo as keyToken, keyIndex}
                        <kbd class="rounded border border-vsc-editor-widget-border bg-vsc-input-bg px-1.5 py-0 text-[0.65rem] leading-4 text-vsc-input-fg">
                          {keyToken}
                        </kbd>
                        {#if keyIndex < combo.length - 1}
                          <span class="text-[0.65rem] text-vsc-muted">+</span>
                        {/if}
                      {/each}
                    </span>
                    {#if comboIndex < row.combos.length - 1}
                      <span class="px-1 text-[0.65rem] text-vsc-muted">or</span>
                    {/if}
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </section>

        <section class="rounded-lg border border-vsc-editor-widget-border bg-vsc-button-secondary-bg p-2.5">
          <h3 class="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-vsc-muted">Actions</h3>
          <div class="grid gap-2">
            {#each actionRows as row}
              <div class="flex items-center justify-between gap-3">
                <span class="text-xs">{row.label}</span>
                <div class="flex flex-wrap items-center gap-1">
                  {#each row.combos as combo, comboIndex}
                    <span class="inline-flex items-center gap-1">
                      {#each combo as keyToken, keyIndex}
                        <kbd class="rounded border border-vsc-editor-widget-border bg-vsc-input-bg px-1.5 py-0 text-[0.65rem] leading-4 text-vsc-input-fg">
                          {keyToken}
                        </kbd>
                        {#if keyIndex < combo.length - 1}
                          <span class="text-[0.65rem] text-vsc-muted">+</span>
                        {/if}
                      {/each}
                    </span>
                    {#if comboIndex < row.combos.length - 1}
                      <span class="px-1 text-[0.65rem] text-vsc-muted">or</span>
                    {/if}
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </section>
      </div>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-vsc-editor-widget-border pt-2">
        <p class="text-[0.65rem] text-vsc-muted">
          Keybinds can be customized in VSCode settings
        </p>
        <button
          type="button"
          class="inline-flex items-center rounded-md border border-vsc-input-border bg-vsc-button-secondary-bg px-2 py-1 text-[0.7rem] font-medium text-vsc-button-secondary-fg hover:bg-vsc-button-secondary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
          onclick={handleCustomizeKeybindsRequest}
        >
          Customize
        </button>
      </div>
    </div>
  </div>
{/if}
