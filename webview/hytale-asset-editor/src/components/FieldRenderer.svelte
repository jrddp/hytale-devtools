<script lang="ts">
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
  import type { FieldInstance } from "../parsing/fieldInstances";

  interface Props {
    field: FieldInstance;
    depth?: number;
  }

  let { field, depth = 0 }: Props = $props();
</script>

{#snippet renderField(nextField: FieldInstance, nextDepth: number)}
  <FieldRenderer field={nextField} depth={nextDepth} />
{/snippet}

{#if field.type === "string"}
  <StringFieldView {field} {depth} />
{:else if field.type === "number"}
  <NumberFieldView {field} {depth} />
{:else if field.type === "boolean"}
  <BooleanFieldView {field} {depth} />
{:else if field.type === "color"}
  <ColorFieldView {field} {depth} />
{:else if field.type === "array"}
  <ArrayFieldView {field} {renderField} {depth} />
{:else if field.type === "object"}
  <ObjectFieldView {field} {renderField} {depth} />
{:else if field.type === "map"}
  <MapFieldView {field} {renderField} {depth} />
{:else if field.type === "inlineOrReference"}
  <InlineOrReferenceFieldView {field} {renderField} {depth} />
{:else if field.type === "variant"}
  <VariantFieldView {field} {renderField} {depth} />
{:else if field.type === "timeline"}
  <TimelineFieldView {field} {depth} />
{:else if field.type === "weightedTimeline"}
  <WeightedTimelineFieldView {field} {depth} />
{:else if field.type === "ref"}
  <RefFieldView {field} {renderField} {depth} />
{:else}
  <RawJsonFieldView {field} {depth} />
{/if}
