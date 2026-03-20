<script lang="ts">
  import { type RenderFieldProps } from "src/common";
  import ArrayFieldView from "./fields/ArrayField.svelte";
  import BooleanFieldView from "./fields/BooleanField.svelte";
  import ColorFieldView from "./fields/ColorField.svelte";
  import InlineOrReferenceFieldView from "./fields/InlineOrReferenceField.svelte";
  import MapFieldView from "./fields/MapField.svelte";
  import NumberFieldView from "./fields/NumberField.svelte";
  import ObjectFieldView from "./fields/ObjectField.svelte";
  import RawJsonFieldView from "./fields/RawJsonField.svelte";
  import StringFieldView from "./fields/StringField.svelte";
  import TimelineFieldView from "./fields/TimelineField.svelte";
  import VariantFieldView from "./fields/VariantField.svelte";
  import WeightedTimelineFieldView from "./fields/WeightedTimelineField.svelte";

  let { field, readOnly = false, ...props }: RenderFieldProps = $props();
  const effectiveReadOnly = $derived(readOnly || field.readonly === true);
</script>

{#if field.type === "string"}
  <StringFieldView {field} readOnly={effectiveReadOnly} {...props} />
{:else if field.type === "number"}
  <NumberFieldView {field} readOnly={effectiveReadOnly} {...props} />
{:else if field.type === "boolean"}
  <BooleanFieldView {field} readOnly={effectiveReadOnly} {...props} />
{:else if field.type === "color"}
  <ColorFieldView {field} readOnly={effectiveReadOnly} {...props} />
{:else if field.type === "array"}
  <ArrayFieldView {field} readOnly={effectiveReadOnly} {...props} />
{:else if field.type === "object"}
  <ObjectFieldView {field} readOnly={effectiveReadOnly} {...props} />
{:else if field.type === "map"}
  <MapFieldView {field} readOnly={effectiveReadOnly} {...props} />
{:else if field.type === "inlineOrReference"}
  <InlineOrReferenceFieldView {field} readOnly={effectiveReadOnly} {...props} />
{:else if field.type === "variant"}
  <VariantFieldView {field} readOnly={effectiveReadOnly} {...props} />
{:else if field.type === "timeline"}
  <TimelineFieldView {field} readOnly={effectiveReadOnly} {...props} />
{:else if field.type === "weightedTimeline"}
  <WeightedTimelineFieldView {field} readOnly={effectiveReadOnly} {...props} />
{:else}
  <RawJsonFieldView {field} readOnly={effectiveReadOnly} {...props} />
{/if}
