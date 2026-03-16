<script lang="ts">
  import type { Field } from "@shared/fieldTypes";
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
  <StringFieldView {field} />
{:else if field.type === "number"}
  <NumberFieldView {field} />
{:else if field.type === "boolean"}
  <BooleanFieldView {field} />
{:else if field.type === "color"}
  <ColorFieldView {field} />
{:else if field.type === "array"}
  <ArrayFieldView {field} {renderField} />
{:else if field.type === "object"}
  <ObjectFieldView {field} {renderField} />
{:else if field.type === "map"}
  <MapFieldView {field} {renderField} />
{:else if field.type === "inlineOrReference"}
  <InlineOrReferenceFieldView {field} />
{:else if field.type === "variant"}
  <VariantFieldView {field} {renderField} />
{:else if field.type === "timeline"}
  <TimelineFieldView {field} />
{:else if field.type === "weightedTimeline"}
  <WeightedTimelineFieldView {field} />
{:else if field.type === "ref"}
  <RefFieldView {field} {renderField} />
{:else}
  <RawJsonFieldView {field} />
{/if}
