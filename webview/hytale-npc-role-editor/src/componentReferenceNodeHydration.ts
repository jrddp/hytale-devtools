import type { DataNodeType, FlowNode } from "@node-editor/common";
import {
  getNpcAnimationAutocompleteValues,
  type NpcAnimationAutocompleteKind,
} from "@shared/npc-role-editor/animationAutocomplete";
import {
  getNpcStateAutocompleteValues,
  type NpcDiscoveredStateInfo,
  type NpcStateAutocompleteKind,
} from "@shared/npc-role-editor/stateAutocomplete";
import {
  createComponentReferenceExportStateFieldSchemaKey,
  createComponentReferenceModifyFieldSchemaKey,
  isComponentReferenceNodeTemplate,
  parseComponentReferenceSyntheticFieldSchemaKey,
} from "@shared/node-editor/componentReferences";
import type { NpcDescriptorDocument } from "@shared/npc-role-editor/descriptorTypes";
import type { NpcParametersJson } from "@shared/npc-role-editor/documentTypes";
import type { NodeField } from "@shared/node-editor/workspaceTypes";
import { buildNpcPropertySections } from "./buildPropertyState";
import type { NpcPropertyField } from "./propertyTypes";
import { humanize } from "./propertyFieldUtilities";
import { workspace } from "./workspace.svelte";

type ComponentReferenceInspection = {
  importStates: string[];
  overrideFields: NodeField[];
};

type HydrateOptions = {
  nodes: FlowNode[];
  descriptors: NpcDescriptorDocument;
  discoveredStateInfo: NpcDiscoveredStateInfo;
};

const inspectionCache = new Map<
  string,
  {
    signature: string;
    inspection: ComponentReferenceInspection;
  }
>();

export function hydrateComponentReferenceNodes({
  nodes,
  descriptors,
  discoveredStateInfo,
}: HydrateOptions): FlowNode[] {
  let didChange = false;

  const nextNodes = nodes.map(node => {
    if (node.type !== "datanode" || !isComponentReferenceNodeTemplate(node.data)) {
      return node;
    }

    const componentClass = node.data.componentReferenceClass;
    const referenceField = node.data.fieldsBySchemaKey.Reference;
    const referenceName = typeof referenceField?.value === "string" ? referenceField.value.trim() : "";
    const targetState =
      componentClass && referenceName
        ? workspace.getComponentReferenceTarget(componentClass, referenceName)
        : undefined;

    if (componentClass && referenceName && !targetState) {
      workspace.requestComponentReferenceTarget(componentClass, referenceName);
    }

    const inspection =
      targetState?.status === "loaded"
        ? inspectComponentReferenceTarget(
            componentClass,
            referenceName,
            targetState.parameters,
            descriptors,
          )
        : undefined;

    const nextFieldsBySchemaKey = buildComponentReferenceFields(
      node as DataNodeType,
      inspection,
      discoveredStateInfo,
    );
    if (componentReferenceFieldsEqual(node.data.fieldsBySchemaKey, nextFieldsBySchemaKey)) {
      return node;
    }

    didChange = true;
    return {
      ...node,
      data: {
        ...node.data,
        fieldsBySchemaKey: nextFieldsBySchemaKey,
      },
    };
  });

  return didChange ? nextNodes : nodes;
}

function inspectComponentReferenceTarget(
  componentClass: string | undefined,
  referenceName: string,
  parameters: NpcParametersJson | undefined,
  descriptors: NpcDescriptorDocument,
): ComponentReferenceInspection | undefined {
  if (!componentClass) {
    return undefined;
  }

  const cacheKey = `${componentClass}::${referenceName}`;
  const signature = JSON.stringify(parameters ?? null);
  const cached = inspectionCache.get(cacheKey);
  if (cached?.signature === signature) {
    return cached.inspection;
  }

  const sections = buildNpcPropertySections(
    {
      Type: "Component",
      Class: componentClass,
      Parameters: parameters,
    },
    descriptors,
    {
      usagesByParameter: new Map(),
      directTranslationByFieldPath: new Map(),
    },
  );
  const parameterSection = sections.find(section => section.id === "parameters");
  if (!parameterSection) {
    return undefined;
  }

  const importStatesField = parameterSection.fields.find(field => field.key === "_ImportStates");
  const importStates =
    importStatesField?.value.kind === "literal" && Array.isArray(importStatesField.value.value)
      ? importStatesField.value.value.filter((value): value is string => typeof value === "string")
      : [];

  const overrideFields = parameterSection.fields
    .filter(field => field.key !== "_ImportStates" && field.preservedData?.Private !== true)
    .map(field => createNodeFieldFromNpcField(field, createComponentReferenceModifyFieldSchemaKey(field.key)));

  const inspection = {
    importStates,
    overrideFields,
  };
  inspectionCache.set(cacheKey, {
    signature,
    inspection,
  });
  return inspection;
}

function buildComponentReferenceFields(
  node: DataNodeType,
  inspection: ComponentReferenceInspection | undefined,
  discoveredStateInfo: NpcDiscoveredStateInfo,
): Record<string, NodeField> {
  const nextFieldsBySchemaKey: Record<string, NodeField> = {};
  const currentReferenceField = node.data.fieldsBySchemaKey.Reference;
  if (currentReferenceField) {
    nextFieldsBySchemaKey.Reference = currentReferenceField;
  }

  const modify = isRecord(node.data.unparsedMetadata?.Modify) ? node.data.unparsedMetadata.Modify : undefined;
  const activeModifyValues = new Map<string, unknown>();
  for (const [modifyKey, value] of Object.entries(modify ?? {})) {
    if (!modifyKey.startsWith("_")) {
      activeModifyValues.set(modifyKey, structuredClone(value));
    }
  }

  const activeExportStates = Array.isArray(modify?._ExportStates)
    ? modify._ExportStates.map(value => (typeof value === "string" ? value : ""))
    : [];

  for (const [schemaKey, field] of Object.entries(node.data.fieldsBySchemaKey)) {
    if (field.isImplicit || field.value === undefined) {
      continue;
    }

    const syntheticField = parseComponentReferenceSyntheticFieldSchemaKey(schemaKey);
    if (!syntheticField) {
      continue;
    }

    switch (syntheticField.kind) {
      case "modify":
        activeModifyValues.set(syntheticField.key, structuredClone(field.value));
        break;
      case "export-state":
        if (typeof field.value === "string") {
          activeExportStates[syntheticField.index] = field.value;
        }
        break;
    }
  }

  const inspectedFieldsByKey = new Map(
    (inspection?.overrideFields ?? []).map(field => [
      String(field.schemaKey).slice(createComponentReferenceModifyFieldSchemaKey("").length),
      field,
    ]),
  );

  if (inspection) {
    for (const field of inspection.overrideFields) {
      const modifyKey = String(field.schemaKey).slice(createComponentReferenceModifyFieldSchemaKey("").length);
      const activeValue = activeModifyValues.get(modifyKey);
      nextFieldsBySchemaKey[field.schemaKey as string] =
        activeValue !== undefined
          ? overrideNodeFieldValue(field, activeValue, false)
          : {
              ...field,
              isImplicit: true,
            };
    }
  }

  for (const [modifyKey, activeValue] of activeModifyValues) {
    const inspectedField = inspectedFieldsByKey.get(modifyKey);
    const schemaKey = createComponentReferenceModifyFieldSchemaKey(modifyKey);
    if (nextFieldsBySchemaKey[schemaKey]) {
      continue;
    }
    nextFieldsBySchemaKey[schemaKey] = inspectedField
      ? overrideNodeFieldValue(inspectedField, activeValue, false)
      : createFallbackModifyField(modifyKey, activeValue);
  }

  if (inspection) {
    inspection.importStates.forEach((importState, index) => {
      nextFieldsBySchemaKey[createComponentReferenceExportStateFieldSchemaKey(index)] =
        createExportStateField(
          createComponentReferenceExportStateFieldSchemaKey(index),
          importState,
          activeExportStates[index] ?? "",
          discoveredStateInfo,
          activeExportStates[index] === undefined,
        );
    });
    for (let index = inspection.importStates.length; index < activeExportStates.length; index += 1) {
      nextFieldsBySchemaKey[createComponentReferenceExportStateFieldSchemaKey(index)] =
        createExportStateField(
          createComponentReferenceExportStateFieldSchemaKey(index),
          `Export State ${index + 1}`,
          activeExportStates[index] ?? "",
          discoveredStateInfo,
          false,
        );
    }
  } else {
    activeExportStates.forEach((value, index) => {
      nextFieldsBySchemaKey[createComponentReferenceExportStateFieldSchemaKey(index)] =
        createExportStateField(
          createComponentReferenceExportStateFieldSchemaKey(index),
          `Export State ${index + 1}`,
          value,
          discoveredStateInfo,
          false,
        );
    });
  }

  return nextFieldsBySchemaKey;
}

function createNodeFieldFromNpcField(field: NpcPropertyField, schemaKey: string): NodeField {
  return {
    schemaKey,
    localId: schemaKey,
    type: npcFieldKindToNodeFieldType(field),
    label: humanize(field.key) ?? field.key,
    description: field.description,
    value: field.value.kind === "compute" ? { Compute: field.value.expression } : structuredClone(field.value.value),
    computable: field.computable === true,
    isImplicit: false,
    overrideAutocompleteValues: field.staticSuggestions ? [...field.staticSuggestions] : undefined,
    symbolLookup: field.symbolRef ? { ...field.symbolRef } : undefined,
    stateAutocompleteKind: field.stateAutocompleteKind,
    animationAutocompleteKind: field.animationAutocompleteKind,
    previewFeatureKind: field.animationAutocompleteKind ? "animation" : undefined,
  };
}

function npcFieldKindToNodeFieldType(field: NpcPropertyField): NodeField["type"] {
  switch (field.kind) {
    case "boolean":
      return "checkbox";
    case "number":
      return "float";
    case "list":
      return "list";
    case "rawJson":
    case "richObject":
    case "graph":
    case "stateTransitions":
      return "object";
    default:
      return "string";
  }
}

function createFallbackModifyField(key: string, value: unknown): NodeField {
  const isComputeValue =
    typeof value === "object" &&
    value !== null &&
    typeof (value as { Compute?: unknown }).Compute === "string";
  const type: NodeField["type"] =
    isComputeValue
      ? "string"
      : typeof value === "boolean"
      ? "checkbox"
      : typeof value === "number"
        ? "float"
        : Array.isArray(value)
          ? "list"
          : value !== null && typeof value === "object"
            ? "object"
            : "string";

  return {
    schemaKey: createComponentReferenceModifyFieldSchemaKey(key),
    localId: createComponentReferenceModifyFieldSchemaKey(key),
    type,
    label: humanize(key) ?? key,
    value: structuredClone(value),
    computable: true,
    isImplicit: false,
  };
}

function createExportStateField(
  schemaKey: string,
  label: string,
  value: string,
  discoveredStateInfo: NpcDiscoveredStateInfo,
  isImplicit: boolean,
): NodeField {
  const suggestions = getNpcStateAutocompleteValues(discoveredStateInfo, "role-full");
  return {
    schemaKey,
    localId: schemaKey,
    type: "string",
    label,
    description: "Maps this imported component state to a parent state name.",
    value,
    isImplicit,
    overrideAutocompleteValues: suggestions.length > 0 ? [...suggestions] : undefined,
  };
}

function componentReferenceFieldsEqual(
  left: Record<string, NodeField>,
  right: Record<string, NodeField>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every(key => {
    const leftField = left[key];
    const rightField = right[key];
    return (
      rightField !== undefined &&
      leftField.type === rightField.type &&
      leftField.label === rightField.label &&
      leftField.description === rightField.description &&
      leftField.computable === rightField.computable &&
      leftField.isImplicit === rightField.isImplicit &&
      JSON.stringify(leftField.value) === JSON.stringify(rightField.value) &&
      JSON.stringify(leftField.overrideAutocompleteValues ?? []) ===
        JSON.stringify(rightField.overrideAutocompleteValues ?? []) &&
      JSON.stringify(leftField.symbolLookup ?? null) === JSON.stringify(rightField.symbolLookup ?? null) &&
      leftField.stateAutocompleteKind === rightField.stateAutocompleteKind &&
      leftField.animationAutocompleteKind === rightField.animationAutocompleteKind &&
      leftField.previewFeatureKind === rightField.previewFeatureKind
    );
  });
}

function overrideNodeFieldValue(
  field: NodeField,
  value: unknown,
  isImplicit: boolean,
): NodeField {
  return {
    ...field,
    value: structuredClone(value),
    isImplicit,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function overrideNodeFieldAutocomplete(
  field: NodeField,
  stateAutocompleteKind: NpcStateAutocompleteKind | undefined,
  discoveredStateInfo: NpcDiscoveredStateInfo,
  animationAutocompleteKind?: NpcAnimationAutocompleteKind,
  appearanceAnimationIds: string[] = [],
): NodeField {
  const nextOverrideAutocompleteValues = stateAutocompleteKind
    ? getNpcStateAutocompleteValues(discoveredStateInfo, stateAutocompleteKind)
    : animationAutocompleteKind
      ? getNpcAnimationAutocompleteValues(appearanceAnimationIds, animationAutocompleteKind)
      : [];
  const normalizedOverrideAutocompleteValues =
    nextOverrideAutocompleteValues.length > 0 ? [...nextOverrideAutocompleteValues] : undefined;

  if (!stateAutocompleteKind && !animationAutocompleteKind) {
    if (
      field.stateAutocompleteKind === undefined &&
      field.animationAutocompleteKind === undefined &&
      field.overrideAutocompleteValues === undefined
    ) {
      return field;
    }

    return {
      ...field,
      stateAutocompleteKind: undefined,
      animationAutocompleteKind: undefined,
      overrideAutocompleteValues: undefined,
    };
  }
  if (
    field.stateAutocompleteKind === stateAutocompleteKind &&
    field.animationAutocompleteKind === animationAutocompleteKind &&
    JSON.stringify(field.overrideAutocompleteValues ?? []) ===
      JSON.stringify(normalizedOverrideAutocompleteValues ?? [])
  ) {
    return field;
  }

  return {
    ...field,
    stateAutocompleteKind,
    animationAutocompleteKind,
    overrideAutocompleteValues: normalizedOverrideAutocompleteValues,
  };
}
