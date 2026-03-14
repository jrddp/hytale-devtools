<script lang="ts">
  import { normalizeCssColor } from "./cssColor";
  import { vscodeThemeColorReference } from "./vscodeThemeColorReference";

  type ThemeDebugRow = {
    section: string;
    id: string;
    cssVar: string;
    tailwindTokens: string[];
    resolvedColor: string;
    resolvedHex: string;
    resolvedHexWithAlpha: string;
  };

  const tailwindColorTokensByCssVar: Record<string, string[]> = {
    "--vscode-foreground": ["vsc-fg"],
    "--vscode-editor-foreground": ["vsc-editor-fg"],
    "--vscode-editorWidget-background": ["vsc-editor-widget-bg", "vsc-panel"],
    "--vscode-editorWidget-border": ["vsc-editor-widget-border"],
    "--vscode-input-background": ["vsc-input-bg"],
    "--vscode-input-foreground": ["vsc-input-fg"],
    "--vscode-input-border": ["vsc-input-border"],
    "--vscode-activityBar-background": ["vsc-activity-bar-bg"],
    "--vscode-descriptionForeground": ["vsc-muted"],
    "--vscode-focusBorder": ["vsc-focus"],
    "--vscode-list-hoverBackground": ["vsc-list-hover", "vsc-panel-hover"],
    "--vscode-list-activeSelectionBackground": ["vsc-list-active-bg", "vsc-selected-bg"],
    "--vscode-list-activeSelectionForeground": ["vsc-list-active-fg", "vsc-selected-fg"],
    "--vscode-button-secondaryBackground": ["vsc-button-secondary-bg", "vsc-button-bg"],
    "--vscode-button-secondaryForeground": ["vsc-button-secondary-fg", "vsc-button-fg"],
    "--vscode-button-secondaryHoverBackground": [
      "vsc-button-secondary-hover",
      "vsc-button-hover",
    ],
    "--vscode-button-border": ["vsc-button-border"],
    "--vscode-errorForeground": ["vsc-error"],
    "--vscode-editor-background": ["vsc-bg"],
    "--vscode-panel-border": ["vsc-border"],
    "--vscode-sideBar-background": ["vsc-panel-alt"],
    "--vscode-badge-background": ["vsc-chip-bg"],
    "--vscode-badge-foreground": ["vsc-chip-fg"],
    "--vscode-editorHoverWidget-background": ["vsc-tooltip-bg"],
    "--vscode-editorHoverWidget-foreground": ["vsc-tooltip-fg"],
    "--vscode-editorHoverWidget-border": ["vsc-tooltip-border"],
    "--vscode-inputValidation-errorBackground": ["vsc-error-bg"],
  };

  let showThemeDebug = $state(false);
  let themeDebugQuery = $state("");
  let themeColorProbe = $state<HTMLSpanElement | null>(null);

  const themeDebugRows = $derived.by(() => {
    const query = themeDebugQuery.trim().toLowerCase();
    if (!showThemeDebug || !themeColorProbe) {
      return [];
    }

    return vscodeThemeColorReference
      .map<ThemeDebugRow>(entry => {
        const section = decodeHtmlEntities(entry.section);
        const cssVar = toThemeCssVar(entry.id);
        const resolvedColor = readResolvedThemeColor(cssVar);
        const normalizedColor = normalizeCssColor(resolvedColor);
        return {
          section,
          id: entry.id,
          cssVar,
          tailwindTokens: tailwindColorTokensByCssVar[cssVar] ?? [],
          resolvedColor,
          resolvedHex: normalizedColor?.hex ?? "",
          resolvedHexWithAlpha: normalizedColor?.hexWithAlpha ?? "",
        };
      })
      .filter(entry => {
        if (!query) {
          return true;
        }

        return [
          entry.section,
          entry.id,
          entry.cssVar,
          ...entry.tailwindTokens,
          entry.resolvedColor,
          entry.resolvedHex,
          entry.resolvedHex.replace("#", ""),
          entry.resolvedHexWithAlpha,
          entry.resolvedHexWithAlpha.replace("#", ""),
        ].some(value => value.toLowerCase().includes(query));
      });
  });

  function toThemeCssVar(id: string): string {
    return `--vscode-${id.replaceAll(".", "-")}`;
  }

  function decodeHtmlEntities(value: string): string {
    return value.replaceAll("&amp;", "&");
  }

  function readResolvedThemeColor(cssVar: string): string {
    if (!themeColorProbe) {
      return "";
    }

    themeColorProbe.style.color = `var(${cssVar}, transparent)`;
    return window.getComputedStyle(themeColorProbe).color.trim();
  }

  function formatResolvedColor(row: ThemeDebugRow): string {
    if (!row.resolvedHexWithAlpha) {
      return row.resolvedColor;
    }

    return row.resolvedHexWithAlpha.endsWith("ff")
      ? row.resolvedHex
      : row.resolvedHexWithAlpha;
  }
</script>

<span
  bind:this={themeColorProbe}
  aria-hidden="true"
  class="pointer-events-none fixed -left-[9999px] -top-[9999px] invisible"
></span>

<button
  type="button"
  class="fixed bottom-4 left-4 z-30 rounded-full border border-vsc-border bg-vsc-panel px-3 py-1.5 text-xs text-vsc-fg transition hover:bg-vsc-panel-hover"
  onclick={() => (showThemeDebug = !showThemeDebug)}
>
  {showThemeDebug ? "Hide Theme Debug" : "Show Theme Debug"}
</button>

{#if showThemeDebug}
  <section class="fixed inset-4 z-30 overflow-hidden rounded-md border border-vsc-border bg-vsc-panel shadow-lg">
    <div class="flex items-center justify-between gap-4 border-b border-vsc-border bg-vsc-panel px-4 py-3">
      <div class="min-w-0">
        <div class="text-base font-semibold">VS Code Theme Color Debug</div>
        <div class="mt-1 text-xs text-vsc-muted">
          Official theme color list from the March 4, 2026 reference page. Showing {themeDebugRows.length}
          entries.
        </div>
      </div>

      <div class="flex items-center gap-3">
        <input
          type="search"
          class="h-9 w-80 rounded-md border border-vsc-border bg-vsc-input-bg px-3 text-sm text-vsc-input-fg outline-none focus:border-vsc-focus"
          bind:value={themeDebugQuery}
          placeholder="Filter section, id, css var, token, hex"
        />
        <button
          type="button"
          class="rounded-md border border-vsc-border bg-vsc-button-bg px-3 py-1.5 text-sm text-vsc-button-fg transition hover:bg-vsc-button-hover"
          onclick={() => (showThemeDebug = false)}
        >
          Close
        </button>
      </div>
    </div>

    <div class="grid grid-cols-[4rem_14rem_minmax(0,1.2fr)_minmax(0,1.1fr)_12rem_10rem] gap-x-4 border-b border-vsc-border bg-vsc-panel-alt px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-vsc-muted">
      <div>Swatch</div>
      <div>Section</div>
      <div>Theme Color ID</div>
      <div>CSS Variable</div>
      <div>Tailwind Token</div>
      <div>Resolved</div>
    </div>

    <div class="h-[calc(100%-5.5rem)] overflow-auto">
      <div class="divide-y divide-vsc-border font-mono text-xs">
        {#each themeDebugRows as row}
          <div class="grid grid-cols-[4rem_14rem_minmax(0,1.2fr)_minmax(0,1.1fr)_12rem_10rem] items-center gap-x-4 px-4 py-2">
            <div class="flex items-center">
              <div
                class="h-7 w-7 rounded-sm border border-vsc-border bg-vsc-panel-alt"
                style={`background-color: var(${row.cssVar}, transparent)`}
              ></div>
            </div>
            <div class="truncate text-vsc-muted">{row.section}</div>
            <div class="truncate text-vsc-fg">{row.id}</div>
            <div class="truncate text-vsc-fg">{row.cssVar}</div>
            <div class="truncate text-vsc-muted">
              {row.tailwindTokens.length ? row.tailwindTokens.join(", ") : ""}
            </div>
            <div class="truncate text-vsc-muted">{formatResolvedColor(row)}</div>
          </div>
        {/each}
      </div>
    </div>
  </section>
{/if}
