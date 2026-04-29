<script lang="ts">
  import { TriangleAlert } from "lucide-svelte";
  import {
    formatNodeEditorDiagnosticsTooltip,
    getHighestNodeEditorDiagnosticSeverity,
    type NodeEditorDiagnostic,
  } from "@shared/node-editor/diagnostics";
  import HoverTooltip from "./HoverTooltip.svelte";

  let {
    diagnostics,
    size = 13,
    wrapperClass = "inline-flex",
    showTooltip = true,
  }: {
    diagnostics: readonly NodeEditorDiagnostic[];
    size?: number;
    wrapperClass?: string;
    showTooltip?: boolean;
  } = $props();

  const severity = $derived(getHighestNodeEditorDiagnosticSeverity(diagnostics));
  const tooltip = $derived(formatNodeEditorDiagnosticsTooltip(diagnostics));
  const color = $derived(
    severity === "error"
      ? "var(--vscode-errorForeground, #f85149)"
      : "var(--vscode-editorWarning-foreground, #cca700)",
  );
</script>

{#if severity && tooltip}
  {#snippet icon()}
    <span class="inline-flex items-center justify-center leading-none" style="color: {color};">
      <TriangleAlert {size} strokeWidth={2.25} aria-hidden="true" />
    </span>
  {/snippet}

  {#if showTooltip}
    <HoverTooltip text={tooltip} placement="top" {wrapperClass}>
      {@render icon()}
    </HoverTooltip>
  {:else}
    {@render icon()}
  {/if}
{/if}
