<script lang="ts">
  import { cloneJsonLike } from "@shared/jsonClone";
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import type { ComputeAutocompleteOption } from "../../../shared/components/computeAutocomplete";
  import ComputeToggleButton from "../../../shared/components/ComputeToggleButton.svelte";
  import DiagnosticIndicator from "@node-editor/components/DiagnosticIndicator.svelte";
  import { useNodeEditorSession } from "@node-editor/workspace.svelte";
  import ComputeField from "@node-editor/fields/ComputeField.svelte";
  import ObjectField from "@node-editor/fields/ObjectField.svelte";
  import ParameterMapField from "@node-editor/fields/ParameterMapField.svelte";
  import {
    buildFieldInputId,
    type FieldCommitOptions,
  } from "@node-editor/node-editor/utils/fieldUtils";
  import { formatNodeFieldPlaceholder } from "@node-editor/node-editor/utils/fieldPlaceholders";
  import BooleanField from "./BooleanField.svelte";
  import ColorField from "./ColorField.svelte";
  import FilePathField from "./FilePathField.svelte";
  import ListField from "./ListField.svelte";
  import NumberField from "./NumberField.svelte";
  import SliderField from "./SliderField.svelte";
  import TextField from "./TextField.svelte";
  import TupleField from "./TupleField.svelte";

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
    uniqueItems,
    listItemType,
    tupleSize,
    tupleItemType,
    parameterMapKeyOverrideAutocompleteValues,
    parameterMapKeySymbolLookup,
    overrideAutocompleteValues,
    previewFeatureKind,
    computable = false,
    defaultValue,
    isSet,
  }: NodeField & {
    nodeId?: string;
    onconfirm: (value: unknown, options?: FieldCommitOptions) => void;
    parentSchemaKey?: string;
    initialValue?: unknown;
  } = $props();

  const workspace = useNodeEditorSession();
  const fieldLabel = $derived(label ?? schemaKey ?? "Field");
  const inputId = $derived(buildFieldInputId(nodeId, schemaKey, parentSchemaKey));
  const defaultPlaceholder = $derived(
    isSet || isEmptyDefaultPlaceholder(defaultValue) ? "" : formatNodeFieldPlaceholder(defaultValue),
  );
  const hasDefaultValue = $derived(defaultValue !== undefined);
  const canSetExplicitEmpty = $derived(
    hasDefaultValue &&
      nodeId !== undefined &&
      schemaKey !== null &&
      parentSchemaKey === undefined &&
      (type === "string" || type === "text"),
  );
  const explicitEmptyVscodeContext = $derived(
    canSetExplicitEmpty
      ? JSON.stringify({
          webviewSection: "nodeEditorField",
          nodeEditorNodeId: nodeId,
          nodeEditorFieldSchemaKey: schemaKey,
          nodeEditorCanSetExplicitEmpty: true,
          ...(workspace.embeddedGraphFieldPath
            ? { nodeEditorGraphFieldPath: workspace.embeddedGraphFieldPath }
            : {}),
        })
      : undefined,
  );
  const computeAutocompleteOptions = $derived<ComputeAutocompleteOption[]>(
    workspace.computeAutocompleteOptions,
  );
  const fieldDiagnostics = $derived(workspace.getFieldDiagnostics(nodeId, schemaKey, parentSchemaKey));
  const fieldDescription = $derived(formatFieldDescription(description, fieldDiagnostics));
  const isComputeMode = $derived(isComputeValue(value));
  const computeExpression = $derived(isComputeValue(value) ? value.Compute : "");

  let lastLiteralValue = $state<unknown>(undefined);
  const fallbackLiteralValue = $derived(
    lastLiteralValue === undefined ? getDefaultLiteralValue(type) : lastLiteralValue,
  );

  $effect(() => {
    if (!isComputeValue(value)) {
      lastLiteralValue = cloneJsonLike($state.snapshot(value));
    }
  });

  function isComputeValue(value: unknown): value is ComputeValue {
    return (
      typeof value === "object" &&
      value !== null &&
      typeof (value as { Compute?: unknown }).Compute === "string"
    );
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
      case "tuple":
        return [];
      case "object":
      case "parameterMap":
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
      onconfirm(cloneJsonLike($state.snapshot(fallbackLiteralValue)));
      return;
    }

    onconfirm({
      Compute: getInitialComputeExpression(type, value),
    });
  }

  function getDisplayValue<T>(fallbackValue: T): T {
    return isSet ? (value as T) : fallbackValue;
  }

  function isEmptyDefaultPlaceholder(value: unknown): boolean {
    return value === undefined || (Array.isArray(value) && value.length === 0);
  }

  function confirmTextValue(nextValue: string) {
    if (nextValue === "" && hasDefaultValue) {
      onconfirm(undefined, {
        isImplicit: true,
        isSet: false,
        isExplicitEmpty: false,
      });
      return;
    }

    onconfirm(nextValue, {
      isImplicit: false,
      isSet: true,
      isExplicitEmpty: false,
    });
  }

  function confirmNumberValue(nextValue: number | undefined) {
    if (nextValue === undefined && hasDefaultValue) {
      onconfirm(undefined, {
        isImplicit: true,
        isSet: false,
        isExplicitEmpty: false,
      });
      return;
    }

    onconfirm(nextValue ?? 0, {
      isImplicit: false,
      isSet: true,
      isExplicitEmpty: false,
    });
  }

  function confirmListValue(nextValue: unknown[]) {
    if (nextValue.length === 0 && hasDefaultValue) {
      onconfirm(undefined, {
        isImplicit: true,
        isSet: false,
        isExplicitEmpty: false,
      });
      return;
    }

    onconfirm(nextValue, {
      isImplicit: false,
      isSet: true,
      isExplicitEmpty: false,
    });
  }

  function confirmTupleValue(nextValue: unknown[]) {
    if (nextValue.length === 0) {
      onconfirm(undefined, {
        isImplicit: true,
        isSet: false,
        isExplicitEmpty: false,
      });
      return;
    }

    onconfirm(nextValue, {
      isImplicit: false,
      isSet: true,
      isExplicitEmpty: false,
    });
  }

  function confirmBooleanValue(nextValue: boolean) {
    if (typeof defaultValue === "boolean" && nextValue === defaultValue) {
      onconfirm(undefined, {
        isImplicit: true,
        isSet: false,
        isExplicitEmpty: false,
      });
      return;
    }

    onconfirm(nextValue, {
      isImplicit: false,
      isSet: true,
      isExplicitEmpty: false,
    });
  }

  function confirmSliderValue(nextValue: number) {
    if (typeof defaultValue === "number" && nextValue === defaultValue) {
      onconfirm(undefined, {
        isImplicit: true,
        isSet: false,
        isExplicitEmpty: false,
      });
      return;
    }

    onconfirm(nextValue, {
      isImplicit: false,
      isSet: true,
      isExplicitEmpty: false,
    });
  }

  function formatFieldDescription(
    description: string | undefined,
    diagnostics: ReturnType<typeof workspace.getFieldDiagnostics>,
  ): string | undefined {
    if (diagnostics.length === 0) {
      return description;
    }

    const diagnosticText = diagnostics
      .map(diagnostic => `${diagnostic.severity === "error" ? "Error" : "Warning"}: ${diagnostic.message}`)
      .join("\n");
    return description ? `${description}\n\n${diagnosticText}` : diagnosticText;
  }

</script>

{#snippet fieldActions()}
  {#if fieldDiagnostics.length > 0}
    <DiagnosticIndicator diagnostics={fieldDiagnostics} showTooltip={false} />
  {/if}
  {#if computable}
    <ComputeToggleButton enabled active={isComputeMode} ontoggle={handleToggleComputeMode} />
  {/if}
{/snippet}

{#if isComputeMode}
  <ComputeField
    {inputId}
    label={fieldLabel}
    description={fieldDescription}
    {inputWidth}
    initialValue={computeExpression}
    autocompleteOptions={computeAutocompleteOptions}
    titleActions={fieldActions}
    onconfirm={expression => onconfirm({ Compute: expression })}
  />
{:else if type === "object"}
  <ObjectField
    {inputId}
    {nodeId}
    {parentSchemaKey}
    {schemaKey}
    label={fieldLabel}
    description={fieldDescription}
    {inputWidth}
    initialValue={value as object}
    titleActions={fieldActions}
    {onconfirm}
    {subfields}
  />
{:else if type === "parameterMap"}
  <ParameterMapField
    {inputId}
    {nodeId}
    {schemaKey}
    {parentSchemaKey}
    label={fieldLabel}
    description={fieldDescription}
    {inputWidth}
    initialValue={getDisplayValue<Record<string, unknown>>({})}
    keyOverrideAutocompleteValues={parameterMapKeyOverrideAutocompleteValues}
    keySymbolLookup={parameterMapKeySymbolLookup}
    titleActions={fieldActions}
    {onconfirm}
  />
{:else if type === "list"}
  <ListField
    {inputId}
    {nodeId}
    {schemaKey}
    {parentSchemaKey}
    label={fieldLabel}
    description={fieldDescription}
    {inputWidth}
    initialValue={getDisplayValue<unknown[]>([])}
    placeholder={defaultPlaceholder}
    {overrideAutocompleteValues}
    {symbolLookup}
    {uniqueItems}
    {listItemType}
    {previewFeatureKind}
    titleActions={fieldActions}
    onconfirm={confirmListValue}
  />
{:else if type === "tuple"}
  <TupleField
    {inputId}
    label={fieldLabel}
    description={fieldDescription}
    {inputWidth}
    initialValue={getDisplayValue<unknown[]>([])}
    {defaultValue}
    tupleSize={tupleSize ?? 0}
    tupleItemType={tupleItemType ?? "string"}
    titleActions={fieldActions}
    onconfirm={confirmTupleValue}
  />
{:else if type === "enum"}
  <TextField
    {inputId}
    label={fieldLabel}
    description={fieldDescription}
    {inputWidth}
    initialValue={getDisplayValue<string>("")}
    placeholder={defaultPlaceholder}
    overrideAutocompleteValues={overrideAutocompleteValues}
    {symbolLookup}
    {previewFeatureKind}
    titleActions={fieldActions}
    vscodeContext={explicitEmptyVscodeContext}
    nativeContextTarget={canSetExplicitEmpty}
    onconfirm={confirmTextValue}
  />
{:else if type === "filepath"}
  <FilePathField
    {inputId}
    label={fieldLabel}
    description={fieldDescription}
    {inputWidth}
    initialValue={getDisplayValue<string>("")}
    titleActions={fieldActions}
    {onconfirm}
  />
{:else if type === "intslider"}
  <SliderField
    {inputId}
    label={fieldLabel}
    description={fieldDescription}
    {inputWidth}
    initialValue={isSet ? (value as number) : typeof defaultValue === "number" ? defaultValue : 0}
    titleActions={fieldActions}
    onconfirm={confirmSliderValue}
  />
{:else if type === "checkbox"}
  <BooleanField
    {inputId}
    label={fieldLabel}
    description={fieldDescription}
    {inputWidth}
    initialValue={isSet ? (value as boolean) : typeof defaultValue === "boolean" ? defaultValue : false}
    titleActions={fieldActions}
    onconfirm={confirmBooleanValue}
  />
{:else if type === "color"}
  <ColorField
    {inputId}
    label={fieldLabel}
    description={fieldDescription}
    {inputWidth}
    initialValue={getDisplayValue<string>("")}
    titleActions={fieldActions}
    {onconfirm}
  />
{:else if type === "int" || type === "float"}
  <NumberField
    {inputId}
    label={fieldLabel}
    description={fieldDescription}
    {inputWidth}
    initialValue={isSet ? (value as number) : undefined}
    placeholder={defaultPlaceholder}
    emptyCommitsUndefined={hasDefaultValue}
    isFloat={type === "float"}
    titleActions={fieldActions}
    onconfirm={confirmNumberValue}
  />
{:else}
  <TextField
    {inputId}
    label={fieldLabel}
    description={fieldDescription}
    {inputWidth}
    initialValue={getDisplayValue<string>("")}
    placeholder={defaultPlaceholder}
    multiline={type === "text"}
    {overrideAutocompleteValues}
    {symbolLookup}
    {previewFeatureKind}
    titleActions={fieldActions}
    vscodeContext={explicitEmptyVscodeContext}
    nativeContextTarget={canSetExplicitEmpty}
    onconfirm={confirmTextValue}
  />
{/if}
