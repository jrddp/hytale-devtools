<script>
  import { createEventDispatcher } from 'svelte';
  import TextField from './TextField.svelte';
  import NumberField from './NumberField.svelte';
  import SliderField from './SliderField.svelte';
  import BooleanField from './BooleanField.svelte';
  import EnumField from './EnumField.svelte';
  import FilePathField from './FilePathField.svelte';
  import ListField from './ListField.svelte';
  import ObjectField from './ObjectField.svelte';
  import { FIELD_TYPES } from '../node-editor/types.js';
  import {
    normalizeFieldType,
    normalizeFieldValue,
    getObjectNestedFields,
    isObject,
  } from '../node-editor/fieldValueUtils.js';

  export let field;
  export let value;

  const dispatch = createEventDispatcher();

  $: fieldType = normalizeFieldType(field?.type);
  $: normalizedValue = normalizeFieldValue(field, value);
  $: nestedFields = getObjectNestedFields(field);

  function emitValue(nextValue) {
    dispatch('change', { value: normalizeFieldValue(field, nextValue) });
  }

  function updateNestedField(fieldId, nextValue) {
    const base = isObject(normalizedValue) ? normalizedValue : {};
    emitValue({
      ...base,
      [fieldId]: nextValue,
    });
  }
</script>

{#if fieldType === FIELD_TYPES.OBJECT}
  <ObjectField {field} hasNestedFields={nestedFields.length > 0}>
    {#each nestedFields as nestedField}
      {#if typeof nestedField?.id === 'string' && nestedField.id.trim()}
        <svelte:self
          field={nestedField}
          value={normalizedValue?.[nestedField.id]}
          on:change={(event) => updateNestedField(nestedField.id, event.detail.value)}
        />
      {/if}
    {/each}
  </ObjectField>
{:else if fieldType === FIELD_TYPES.LIST}
  <ListField {field} value={normalizedValue} on:change={(event) => emitValue(event.detail.value)} />
{:else if fieldType === FIELD_TYPES.ENUM}
  <EnumField {field} value={normalizedValue} on:change={(event) => emitValue(event.detail.value)} />
{:else if fieldType === FIELD_TYPES.FILE_PATH}
  <FilePathField {field} value={normalizedValue} on:change={(event) => emitValue(event.detail.value)} />
{:else if fieldType === FIELD_TYPES.INT_SLIDER}
  <SliderField {field} value={normalizedValue} on:change={(event) => emitValue(event.detail.value)} />
{:else if fieldType === FIELD_TYPES.CHECKBOX || fieldType === FIELD_TYPES.BOOL}
  <BooleanField {field} value={normalizedValue} on:change={(event) => emitValue(event.detail.value)} />
{:else if fieldType === FIELD_TYPES.INT || fieldType === FIELD_TYPES.INTEGER || fieldType === FIELD_TYPES.FLOAT}
  <NumberField {field} value={normalizedValue} on:change={(event) => emitValue(event.detail.value)} />
{:else}
  <TextField {field} value={normalizedValue} on:change={(event) => emitValue(event.detail.value)} />
{/if}
