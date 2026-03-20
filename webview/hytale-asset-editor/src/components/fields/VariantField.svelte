<script lang="ts">
  import { type RenderFieldProps } from "src/common";
  import FieldPanel from "src/components/FieldPanel.svelte";
  import ObjectField from "src/components/fields/ObjectField.svelte";
  import StringField from "src/components/fields/StringField.svelte";
  import { workspace } from "src/workspace.svelte";
  import type { VariantFieldInstance } from "../../parsing/fieldInstances";
  import {
    buildOutlineSections,
    groupFieldsBySection,
    isFieldSet,
    type OutlineSection,
  } from "../fieldHelpers";

  let {
    field,
    depth = 0,
    readOnly = false,
    readOnlyMessage,
    fieldPanelOverrides,
    root = false,
    onSectionsChange,
    handle,
  }: RenderFieldProps<VariantFieldInstance> & {
    root?: boolean;
    onSectionsChange?: (sections: OutlineSection[]) => void;
  } = $props();

  const selectedIdentity = $derived(
    field.identityField.value ?? field.identityField.inheritedValue ?? field.identityField.default,
  );
  const visibleProperties = $derived.by(() => {
    return workspace.hideUnsetFields
      ? Object.fromEntries(
          Object.entries(field.activeVariant?.properties ?? {}).filter(([, childField]) =>
            isFieldSet(childField),
          ),
        )
      : (field.activeVariant?.properties ?? {});
  });
  const sections = $derived(groupFieldsBySection(visibleProperties));
  const outlineSections = $derived.by(() => {
    return buildOutlineSections(sections);
  });

  function onChangeIdentity() {
    const effectiveIdentity =
      field.identityField.value ?? field.identityField.inheritedValue ?? field.identityField.default;

    if (!effectiveIdentity) {
      field.activeVariant = undefined;
      return;
    }

    const nextVariantField = field.variantsByIdentity[effectiveIdentity];
    if (!nextVariantField) {
      field.activeVariant = undefined;
      return;
    }

    field.activeVariant = workspace.createEmptyFieldInstance(
      nextVariantField,
    );
    field.activeVariant.properties[field.identityField.schemaKey] = field.identityField;
  }

  $effect(() => {
    if (root) {
      onSectionsChange?.(outlineSections);
    }
  });
</script>

{#if field.activeVariant}
  <FieldPanel {field} {depth} {readOnly} {fieldPanelOverrides} {handle}>
    <ObjectField
      field={field.activeVariant}
      {depth}
      {readOnly}
      {readOnlyMessage}
      root={true}
      renderSections={root}
    />
  </FieldPanel>
{:else}
  <FieldPanel field={field.identityField} {depth} {readOnly} {fieldPanelOverrides} {handle}>
    <StringField
      field={field.identityField}
      {depth}
      {readOnly}
      {readOnlyMessage}
      oncommitchange={onChangeIdentity}
    />
  </FieldPanel>
{/if}
