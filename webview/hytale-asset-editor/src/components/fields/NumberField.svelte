<script lang="ts">
  import { onMount } from "svelte";
  import type { NumberFieldInstance } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
  import { getFieldPlaceholder } from "../fieldHelpers";
  import FieldPanel from "../FieldPanel.svelte";

  let {
    field,
    depth = 0,
    onunset,
  }: {
    field: NumberFieldInstance;
    depth?: number;
    onunset?: () => void;
  } = $props();

  // TODO handle infinity

  const isSet = $derived(field.value !== undefined);
  const placeholder = $derived(getFieldPlaceholder(field));
  const hasFallbackPlaceholder = $derived(
    field.inheritedValue !== undefined || field.default !== undefined,
  );

  let draftValue = $state<string>();

  onMount(() => {
    draftValue = field.value?.toString();
  });

  function sanitize(value: string) {
    value = value.trim();

    if (value === "") {
      return "";
    }

    if (field.isInteger) {
      value = value.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "");
    } else {
      value = value
        .replace(/[^\d.-]/g, "")
        .replace(/(?!^)-/g, "")
        .replace(/(\..*)\./g, "$1");
    }

    if (field.maximum !== undefined && Number(value) > field.maximum) {
      value = field.maximum.toString();
    }

    if (field.minimum !== undefined && Number(value) < field.minimum) {
      value = field.minimum.toString();
    }

    return value;
  }

  function commitValue() {
    if (!draftValue) draftValue = undefined;
    if (draftValue === field.value) return;
    field.value = draftValue ? Number(draftValue) : undefined;
    workspace.applyDocumentState();
  }

  function unsetValue() {
    draftValue = undefined;
    commitValue();
  }
</script>

<FieldPanel {field} {depth} inline onunset={isSet ? (onunset ?? unsetValue) : undefined}>
  <input
    type="text"
    class="w-full px-3 py-2 border rounded-md border-vsc-border bg-vsc-input-bg text-vsc-input-fg"
    bind:value={draftValue}
    {placeholder}
    class:placeholder:italic={!hasFallbackPlaceholder}
    inputmode={field.isInteger ? "numeric" : "decimal"}
    oninput={event => {
      draftValue = sanitize(event.currentTarget.value);
    }}
    onblur={commitValue}
    onkeydown={event => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        commitValue();
        event.currentTarget.blur();
        return;
      }
    }}
  />
</FieldPanel>
