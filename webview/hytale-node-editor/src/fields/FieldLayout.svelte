<script lang="ts">
  import HoverTooltip from "@node-editor/components/HoverTooltip.svelte";
  import type { Snippet } from "svelte";

  let {
    inputId: _inputId,
    label,
    description,
    align = "start",
    titleActions,
    vscodeContext,
    nativeContextTarget,
    children,
  }: {
    inputId: string;
    label: string;
    description?: string;
    align?: "start" | "center";
    titleActions?: Snippet;
    vscodeContext?: string;
    nativeContextTarget?: boolean;
    children?: Snippet;
  } = $props();

  const labelWrapperClass = $derived(
    align === "start"
      ? "justify-self-end self-start pt-1.5"
      : "flex min-h-8 self-stretch items-center justify-end",
  );

  const contentClass = $derived(
    align === "start"
      ? "min-w-0 self-start"
      : "flex min-h-8 min-w-0 self-stretch items-center",
  );
</script>

<HoverTooltip text={description} placement="right" wrapperClass={labelWrapperClass}>
  <div class="flex items-center justify-end gap-1 select-none text-right text-xs leading-4 text-vsc-muted">
    <span>{label}</span>
    {#if titleActions}
      <span class="inline-flex h-4 items-center gap-1 leading-none">
        {@render titleActions()}
      </span>
    {/if}
  </div>
</HoverTooltip>

<div
  class={contentClass}
  data-vscode-context={vscodeContext}
  data-node-editor-field-context={nativeContextTarget ? "true" : undefined}
>
  {@render children?.()}
</div>
