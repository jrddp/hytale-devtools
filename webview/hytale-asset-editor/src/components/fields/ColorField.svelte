<script lang="ts">
  import { onMount } from "svelte";
  import type { ColorFieldInstance } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  let {
    field,
    depth = 0,
    onunset,
  }: {
    field: ColorFieldInstance;
    depth?: number;
    onunset?: () => void;
  } = $props();

  const isSet = $derived(field.value !== undefined);

  let draftValue = $state<string>();

  onMount(() => {
    draftValue = field.value;
  });

  function commitValue() {
    draftValue = draftValue.trim();
    if (!draftValue) {
      unsetValue();
      return;
    }

    if (!draftValue.match(/^#([0-9a-fA-F]{6})$/)) {
      draftValue = field.value;
      return;
    }

    if (draftValue === field.value) {
      return;
    }

    field.value = draftValue;
    workspace.applyDocumentState();
  }

  function unsetValue() {
    if (field.value === undefined) {
      return;
    }

    field.value = undefined;
    workspace.applyDocumentState();
  }
</script>

<FieldPanel
  {field}
  {depth}
  summary={field.colorType}
  inline
  onunset={isSet ? (onunset ?? unsetValue) : undefined}
>
  <div class="flex items-center gap-3">
    <input
      type="color"
      class="w-8 h-8 bg-transparent border rounded-md border-vsc-border"
      bind:value={draftValue}
      onchange={commitValue}
    />
    <input
      type="text"
      class="flex-1 px-3 py-2 border rounded-md border-vsc-border bg-vsc-input-bg text-vsc-input-fg"
      bind:value={draftValue}
      placeholder={field.default ?? "Unset"}
      class:placeholder:italic={field.default === undefined}
      spellcheck="false"
      onblur={commitValue}
      onkeydown={event => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          commitValue();
          event.currentTarget.blur();
        }
      }}
    />
  </div>
</FieldPanel>
