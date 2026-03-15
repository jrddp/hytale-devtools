<script lang="ts">
  import type {
    ArrayField,
    BooleanField,
    ColorField,
    Field,
    InlineOrReferenceField,
    MapField,
    NumberField,
    ObjectField,
    RawJsonField,
    RefField,
    StringField,
    TimelineField,
    VariantField,
    WeightedTimelineField,
  } from "@shared/fieldTypes";
  import FieldRenderer from "./FieldRenderer.svelte";
  import ArrayFieldView from "./fields/ArrayField.svelte";
  import BooleanFieldView from "./fields/BooleanField.svelte";
  import ColorFieldView from "./fields/ColorField.svelte";
  import InlineOrReferenceFieldView from "./fields/InlineOrReferenceField.svelte";
  import MapFieldView from "./fields/MapField.svelte";
  import NumberFieldView from "./fields/NumberField.svelte";
  import ObjectFieldView from "./fields/ObjectField.svelte";
  import RawJsonFieldView from "./fields/RawJsonField.svelte";
  import RefFieldView from "./fields/RefField.svelte";
  import StringFieldView from "./fields/StringField.svelte";
  import TimelineFieldView from "./fields/TimelineField.svelte";
  import VariantFieldView from "./fields/VariantField.svelte";
  import WeightedTimelineFieldView from "./fields/WeightedTimelineField.svelte";

  interface Props {
    field: Field;
  }

  let { field }: Props = $props();
</script>

{#snippet renderField(nextField: Field)}
  <FieldRenderer field={nextField} />
{/snippet}

{#if field.type === "string"}
  <StringFieldView field={field as StringField} />
{:else if field.type === "number"}
  <NumberFieldView field={field as NumberField} />
{:else if field.type === "boolean"}
  <BooleanFieldView field={field as BooleanField} />
{:else if field.type === "color"}
  <ColorFieldView field={field as ColorField} />
{:else if field.type === "array"}
  <ArrayFieldView field={field as ArrayField} {renderField} />
{:else if field.type === "object"}
  <ObjectFieldView field={field as ObjectField} {renderField} />
{:else if field.type === "map"}
  <MapFieldView field={field as MapField} {renderField} />
{:else if field.type === "inlineOrReference"}
  <InlineOrReferenceFieldView field={field as InlineOrReferenceField} />
{:else if field.type === "variant"}
  <VariantFieldView field={field as VariantField} {renderField} />
{:else if field.type === "timeline"}
  <TimelineFieldView field={field as TimelineField} />
{:else if field.type === "weightedTimeline"}
  <WeightedTimelineFieldView field={field as WeightedTimelineField} />
{:else if field.type === "ref"}
  <RefFieldView field={field as RefField} {renderField} />
{:else}
  <RawJsonFieldView field={field as RawJsonField} />
{/if}
