<script lang="ts">
  import type { Field } from "@shared/fieldTypes";
  import type { Snippet } from "svelte";
  import { getFieldLabel } from "./fieldHelpers";

  interface Props {
    field: Field;
    summary?: string;
    actions?: Snippet;
    children?: Snippet;
  }

  let { field, summary = "", actions, children }: Props = $props();

  const detail = $derived([summary, field.title ? field.schemaKey : ""].filter(Boolean).join(" · "));
</script>

<section class="rounded-md border border-vsc-border bg-vsc-panel">
  <div class="flex items-start gap-3 border-b border-vsc-border px-3 py-2.5">
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="truncate text-sm font-semibold">{field.schemaKey ?? "NO SCHEMA KEY"}</h2>
        <span class="rounded bg-vsc-chip-bg px-2 py-0.5 text-[11px] font-medium text-vsc-chip-fg">
          {field.type}
        </span>
        {#if field.nullable}
          <span class="rounded border border-vsc-border px-2 py-0.5 text-[11px] opacity-75">
            nullable
          </span>
        {/if}
      </div>

      {#if detail}
        <div class="mt-1 truncate text-xs opacity-65">{detail}</div>
      {/if}
    </div>

    {#if actions}
      <div class="flex items-center gap-2">{@render actions()}</div>
    {/if}
  </div>

  {#if children}
    <div class="space-y-3 p-3">
      {@render children()}
    </div>
  {/if}
</section>
