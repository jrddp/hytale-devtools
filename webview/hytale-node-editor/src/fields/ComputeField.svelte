<script lang="ts">
  import FieldLayout from "@node-editor/fields/FieldLayout.svelte";
  import type { FieldProps } from "@node-editor/node-editor/utils/fieldUtils";
  import type { Snippet } from "svelte";
  import type { ComputeAutocompleteOption } from "@webview-shared/components/computeAutocomplete";
  import ComputeAutocompleteInput from "../../../shared/components/ComputeAutocompleteInput.svelte";

  let {
    inputId,
    label,
    description,
    initialValue,
    inputWidth,
    onconfirm,
    autocompleteOptions = [],
    titleActions,
  }: FieldProps<string> & {
    autocompleteOptions?: ComputeAutocompleteOption[];
    titleActions?: Snippet;
  } = $props();

  const MIN_COMPUTE_INPUT_WIDTH = 180;
  const MIN_COMPUTE_MENU_WIDTH = "22rem";
  const MAX_COMPUTE_MENU_WIDTH = "30rem";

  let value = $state("");
  let lastCommittedValue = "";
  const effectiveWidth = $derived(
    inputWidth !== undefined ? Math.max(inputWidth, MIN_COMPUTE_INPUT_WIDTH) : undefined,
  );
  const effectiveMinWidth = $derived(
    `${Math.max(inputWidth ?? 0, MIN_COMPUTE_INPUT_WIDTH)}px`,
  );

  $effect(() => {
    const nextInitialValue = initialValue ?? "";
    if (nextInitialValue !== lastCommittedValue) {
      value = nextInitialValue;
      lastCommittedValue = nextInitialValue;
    }
  });

  function confirmValue(nextValue = value) {
    value = nextValue;
    if (nextValue === lastCommittedValue) {
      return true;
    }

    onconfirm(nextValue);
    lastCommittedValue = nextValue;
    return true;
  }
</script>

<FieldLayout {inputId} {label} {description} align="center" {titleActions}>
  <div
    class="min-w-0"
    class:w-full={inputWidth === undefined}
    style:width={effectiveWidth !== undefined ? `${effectiveWidth}px` : undefined}
    style:min-width={effectiveMinWidth}
  >
    <ComputeAutocompleteInput
      {inputId}
      initialValue={value}
      autocompleteOptions={autocompleteOptions}
      inputClass="w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1 text-[11px] leading-4 font-mono text-vsc-input-fg nodrag"
      overlayClass="block w-full px-2 py-1 text-[11px] leading-4 font-mono whitespace-pre"
      listClass="nodrag nowheel absolute left-0 top-full z-40 w-max min-w-full max-w-[30rem] max-h-32 overflow-auto rounded-t-none rounded-md border border-vsc-input-border bg-vsc-editor-widget-bg shadow-lg"
      optionClass="block w-full cursor-pointer px-2 py-1 text-left text-vsc-input-fg hover:bg-vsc-list-hover"
      menuMinWidth={MIN_COMPUTE_MENU_WIDTH}
      menuMaxWidth={MAX_COMPUTE_MENU_WIDTH}
      oncommit={nextValue => confirmValue(nextValue)}
    />
  </div>
</FieldLayout>
