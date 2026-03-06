<script lang="ts">
  import HoverTooltip from "src/components/HoverTooltip.svelte";
  import type { Snippet } from "svelte";

  let {
    inputId: _inputId,
    label,
    description,
    align = "start",
    children,
  }: {
    inputId: string;
    label: string;
    description?: string;
    align?: "start" | "center";
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
  <div class="block select-none text-right text-xs leading-4 text-vsc-muted">
    {label}
  </div>
</HoverTooltip>

<div class={contentClass}>
  {@render children?.()}
</div>
