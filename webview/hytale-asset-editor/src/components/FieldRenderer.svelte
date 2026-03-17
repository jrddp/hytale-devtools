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
  import RefFieldView from "./fields/RefField.svelte";
  import StringFieldView from "./fields/StringField.svelte";
  import TimelineFieldView from "./fields/TimelineField.svelte";
  import VariantFieldView from "./fields/VariantField.svelte";
  import WeightedTimelineFieldView from "./fields/WeightedTimelineField.svelte";

  let { field, ...props }: RenderFieldProps = $props();
</script>

{#if field.type === "string"}
  <StringFieldView {field} {...props} />
{:else if field.type === "number"}
  <NumberFieldView {field} {...props} />
{:else if field.type === "boolean"}
  <BooleanFieldView {field} {...props} />
{:else if field.type === "color"}
  <ColorFieldView {field} {...props} />
{:else if field.type === "array"}
  <ArrayFieldView {field} {...props} />
{:else if field.type === "object"}
  <ObjectFieldView {field} {...props} />
{:else if field.type === "map"}
  <MapFieldView {field} {...props} />
{:else if field.type === "inlineOrReference"}
  <InlineOrReferenceFieldView {field} {...props} />
{:else if field.type === "variant"}
  <VariantFieldView {field} {...props} />
{:else if field.type === "timeline"}
  <TimelineFieldView {field} {...props} />
{:else if field.type === "weightedTimeline"}
  <WeightedTimelineFieldView {field} {...props} />
{:else if field.type === "ref"}
  <RefFieldView {field} {...props} />
{:else}
  <RawJsonFieldView {field} {...props} />
{/if}
