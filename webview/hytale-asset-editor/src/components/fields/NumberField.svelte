<script lang="ts">
  import { onMount } from "svelte";
  import type { NumberFieldInstance } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
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

  function unsetValue() {
    field.value = undefined;
    draftValue = undefined;
    workspace.applyDocumentState();
  }

  function commitValue() {
    if (!draftValue) {
      unsetValue();
      return;
    }

    field.value = Number(draftValue);
    workspace.applyDocumentState();
  }
</script>

<FieldPanel {field} {depth} inline onunset={isSet ? (onunset ?? unsetValue) : undefined}>
  <input
    type="text"
    class="w-full px-3 py-2 border rounded-md border-vsc-border bg-vsc-input-bg text-vsc-input-fg"
    bind:value={draftValue}
    placeholder={field.default?.toString() ?? "Unset"}
    class:placeholder:italic={field.default === undefined}
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
