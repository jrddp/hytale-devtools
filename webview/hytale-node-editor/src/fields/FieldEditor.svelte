<script lang="ts">
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import type { ComputeAutocompleteOption } from "../../../shared/components/computeAutocomplete";
  import ComputeToggleButton from "../../../shared/components/ComputeToggleButton.svelte";
  import { useNodeEditorSession } from "@node-editor/workspace.svelte";
  import ComputeField from "@node-editor/fields/ComputeField.svelte";
  import ObjectField from "@node-editor/fields/ObjectField.svelte";
  import { buildFieldInputId } from "@node-editor/node-editor/utils/fieldUtils";
  import BooleanField from "./BooleanField.svelte";
  import ColorField from "./ColorField.svelte";
  import FilePathField from "./FilePathField.svelte";
  import ListField from "./ListField.svelte";
  import NumberField from "./NumberField.svelte";
  import SliderField from "./SliderField.svelte";
  import TextField from "./TextField.svelte";

  type ComputeValue = {
    Compute: string;
  };

  let {
    nodeId,
    schemaKey,
    type,
    label,
    description,
    inputWidth,
    value,
    subfields,
    onconfirm,
    parentSchemaKey,
    symbolLookup,
    overrideAutocompleteValues,
    computable = false,
  }: NodeField & {
    nodeId?: string;
    onconfirm: (value: unknown) => void;
    parentSchemaKey?: string;
    initialValue?: unknown;
  } = $props();

  const workspace = useNodeEditorSession();
  const fieldLabel = $derived(label ?? schemaKey ?? "Field");
  const inputId = $derived(buildFieldInputId(nodeId, schemaKey, parentSchemaKey));
  const computeAutocompleteOptions = $derived<ComputeAutocompleteOption[]>(
    workspace.computeAutocompleteOptions,
  );
  const isComputeMode = $derived(isComputeValue(value));
  const computeExpression = $derived(isComputeValue(value) ? value.Compute : "");

  let lastLiteralValue = $state<unknown>(undefined);
  const fallbackLiteralValue = $derived(
    lastLiteralValue === undefined ? getDefaultLiteralValue(type) : lastLiteralValue,
  );

  $effect(() => {
    if (!isComputeValue(value)) {
      lastLiteralValue = cloneJsonLike(value);
    }
  });

  function isComputeValue(value: unknown): value is ComputeValue {
    return (
      typeof value === "object" &&
      value !== null &&
      typeof (value as { Compute?: unknown }).Compute === "string"
    );
  }

  function cloneJsonLike<T>(value: T): T {
    if (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    return structuredClone($state.snapshot(value)) as T;
  }

  function getDefaultLiteralValue(fieldType: NodeField["type"]): unknown {
    switch (fieldType) {
      case "checkbox":
        return false;
      case "int":
      case "float":
      case "intslider":
        return 0;
      case "list":
        return [];
      case "object":
        return {};
      default:
        return "";
    }
  }

  function getInitialComputeExpression(
    fieldType: NodeField["type"],
    currentValue: unknown,
  ): string {
    if (typeof currentValue === "number" || typeof currentValue === "boolean") {
      return String(currentValue);
    }

    if (
      (fieldType === "int" || fieldType === "float" || fieldType === "intslider") &&
      typeof currentValue === "string" &&
      currentValue.trim().length > 0
    ) {
      return currentValue;
    }

    return "";
  }

  function handleToggleComputeMode() {
    if (!computable) {
      return;
    }

    if (isComputeValue(value)) {
      onconfirm(cloneJsonLike(fallbackLiteralValue));
      return;
    }

    onconfirm({
      Compute: getInitialComputeExpression(type, value),
    });
  }
</script>

{#snippet computeToggle()}
  {#if computable}
    <ComputeToggleButton enabled active={isComputeMode} ontoggle={handleToggleComputeMode} />
  {/if}
{/snippet}

{#if isComputeMode}
  <ComputeField
    {inputId}
    label={fieldLabel}
    {description}
    {inputWidth}
    initialValue={computeExpression}
    autocompleteOptions={computeAutocompleteOptions}
    titleActions={computeToggle}
    onconfirm={expression => onconfirm({ Compute: expression })}
  />
{:else if type === "object"}
  <ObjectField
    {inputId}
    {nodeId}
    {parentSchemaKey}
    {schemaKey}
    label={fieldLabel}
    {description}
    {inputWidth}
    initialValue={value as object}
    titleActions={computeToggle}
    {onconfirm}
    {subfields}
  />
{:else if type === "list"}
  <ListField
    {inputId}
    label={fieldLabel}
    {description}
    {inputWidth}
    initialValue={value as string[]}
    titleActions={computeToggle}
    {onconfirm}
  />
{:else if type === "enum"}
  <TextField
    {inputId}
    label={fieldLabel}
    {description}
    {inputWidth}
    initialValue={value as string}
    overrideAutocompleteValues={overrideAutocompleteValues}
    {symbolLookup}
    titleActions={computeToggle}
    {onconfirm}
  />
{:else if type === "filepath"}
  <FilePathField
    {inputId}
    label={fieldLabel}
    {description}
    {inputWidth}
    initialValue={value as string}
    titleActions={computeToggle}
    {onconfirm}
  />
{:else if type === "intslider"}
  <SliderField
    {inputId}
    label={fieldLabel}
    {description}
    {inputWidth}
    initialValue={value as number}
    titleActions={computeToggle}
    {onconfirm}
  />
{:else if type === "checkbox"}
  <BooleanField
    {inputId}
    label={fieldLabel}
    {description}
    {inputWidth}
    initialValue={value as boolean}
    titleActions={computeToggle}
    {onconfirm}
  />
{:else if type === "color"}
  <ColorField
    {inputId}
    label={fieldLabel}
    {description}
    {inputWidth}
    initialValue={value as string}
    titleActions={computeToggle}
    {onconfirm}
  />
{:else if type === "int" || type === "float"}
  <NumberField
    {inputId}
    label={fieldLabel}
    {description}
    {inputWidth}
    initialValue={value as number}
    isFloat={type === "float"}
    titleActions={computeToggle}
    {onconfirm}
  />
{:else}
  <TextField
    {inputId}
    label={fieldLabel}
    {description}
    {inputWidth}
    initialValue={value as string}
    multiline={type === "text"}
    {overrideAutocompleteValues}
    {symbolLookup}
    titleActions={computeToggle}
    {onconfirm}
  />
{/if}
