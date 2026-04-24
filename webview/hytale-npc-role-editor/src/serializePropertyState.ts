import type {
  NpcComputeJson,
  NpcModifyJson,
  NpcParameterDefinitionJson,
  NpcParametersJson,
  NpcRoleJson,
} from "./parsing/documentTypes";
import type { NpcFieldValue, NpcPropertyField, NpcPropertySection, NpcPropertyState } from "./propertyTypes";
import { cloneJsonLike, getTypeHintForItemType, serializeFieldValue } from "./propertyFieldUtilities";

export function serializeNpcPropertyState(state: NpcPropertyState): NpcRoleJson {
  const root = new Map<string, unknown>();
  root.set("Type", state.roleType);

  if (state.roleType === "Component" && state.componentClass) {
    root.set("Class", state.componentClass);
  }

  for (const section of state.sections) {
    switch (section.id) {
      case "parameters": {
        const serializedParameters = serializeParametersSection(section);
        if (serializedParameters) {
          root.set("Parameters", serializedParameters);
        }
        break;
      }
      case "roleAttributes": {
        for (const field of section.fields) {
          if (field.isSet === false) {
            continue;
          }

          root.set(field.key, serializeFieldValue(field.value));
        }
        break;
      }
      case "variantReference": {
        for (const field of section.fields) {
          if (field.isSet === false) {
            continue;
          }

          root.set(field.key, serializeFieldValue(field.value));
        }
        break;
      }
      case "modify": {
        const serializedModify = serializeModifySection(section);
        if (serializedModify) {
          root.set("Modify", serializedModify);
        }
        break;
      }
      case "content": {
        const serializedContent = serializeSingleSectionField(section);
        if (serializedContent !== undefined) {
          root.set("Content", serializedContent);
        }
        break;
      }
      case "instructions": {
        const serializedInstructions = serializeSingleSectionField(section);
        const instructionsField = section.fields[0];
        if (serializedInstructions !== undefined) {
          root.set("Instructions", serializedInstructions);
        }
        for (const [key, value] of Object.entries(instructionsField?.preservedData ?? {})) {
          root.set(key, cloneJsonLike(value));
        }
        break;
      }
      case "interactionInstruction": {
        const serializedInstruction = serializeSingleSectionField(section);
        if (serializedInstruction !== undefined) {
          root.set("InteractionInstruction", serializedInstruction);
        }
        break;
      }
      case "deathInstruction": {
        const serializedInstruction = serializeSingleSectionField(section);
        if (serializedInstruction !== undefined) {
          root.set("DeathInstruction", serializedInstruction);
        }
        break;
      }
      case "motionControllerList": {
        const serializedControllers = serializeSingleSectionField(section);
        if (serializedControllers !== undefined) {
          root.set("MotionControllerList", serializedControllers);
        }
        break;
      }
      case "stateTransitions": {
        const serializedTransitions = serializeSingleSectionField(section);
        if (serializedTransitions !== undefined) {
          root.set("StateTransitions", serializedTransitions);
        }
        break;
      }
      default:
        break;
    }
  }

  for (const [key, value] of Object.entries(state.preservedTopLevelFields)) {
    if (!root.has(key)) {
      root.set(key, cloneJsonLike(value));
    }
  }

  return Object.fromEntries(root) as NpcRoleJson;
}

function serializeParametersSection(section: NpcPropertySection): NpcParametersJson | null {
  const serializedFieldsByKey = new Map<string, unknown>();

  for (const field of section.fields) {
    if (field.key === "_ImportStates") {
      if (field.value.kind === "literal" && Array.isArray(field.value.value) && field.isSet) {
        serializedFieldsByKey.set(
          field.key,
          field.value.value.filter((item): item is string => typeof item === "string"),
        );
      }
      continue;
    }

    serializedFieldsByKey.set(field.key, serializeParameterField(field));
  }

  const orderedKeys = [
    ...(section.keyOrder ?? []).filter(
      key => serializedFieldsByKey.has(key) || key in (section.preservedFields ?? {}),
    ),
    ...Array.from(serializedFieldsByKey.keys()).filter(
      key => !(section.keyOrder ?? []).includes(key),
    ),
    ...Object.keys(section.preservedFields ?? {}).filter(
      key => !(section.keyOrder ?? []).includes(key),
    ),
  ];

  if (orderedKeys.length === 0) {
    return null;
  }

  const parameters = new Map<string, unknown>();
  for (const key of orderedKeys) {
    if (serializedFieldsByKey.has(key)) {
      parameters.set(key, serializedFieldsByKey.get(key));
      continue;
    }

    if (section.preservedFields && key in section.preservedFields) {
      parameters.set(key, cloneJsonLike(section.preservedFields[key]));
    }
  }

  return Object.fromEntries(parameters) as NpcParametersJson;
}

function serializeModifySection(section: NpcPropertySection): NpcModifyJson | null {
  const serializedFieldsByKey = new Map<string, unknown>();

  for (const field of section.fields) {
    if (field.isSet === false) {
      continue;
    }

    serializedFieldsByKey.set(field.key, serializeFieldValue(field.value));
  }

  const orderedKeys = [
    ...(section.keyOrder ?? []).filter(
      key => serializedFieldsByKey.has(key) || key in (section.preservedFields ?? {}),
    ),
    ...Array.from(serializedFieldsByKey.keys()).filter(
      key => !(section.keyOrder ?? []).includes(key),
    ),
    ...Object.keys(section.preservedFields ?? {}).filter(
      key => !(section.keyOrder ?? []).includes(key),
    ),
  ];

  if (orderedKeys.length === 0) {
    return null;
  }

  const modify = new Map<string, unknown>();
  for (const key of orderedKeys) {
    if (serializedFieldsByKey.has(key)) {
      modify.set(key, serializedFieldsByKey.get(key));
      continue;
    }

    if (section.preservedFields && key in section.preservedFields) {
      modify.set(key, cloneJsonLike(section.preservedFields[key]));
    }
  }

  return Object.fromEntries(modify) as NpcModifyJson;
}

function serializeParameterField(field: NpcPropertyField): NpcParameterDefinitionJson {
  const parameterDefinition = new Map<string, unknown>();
  parameterDefinition.set("Value", serializeFieldValue(field.value));

  if (field.description?.trim()) {
    parameterDefinition.set("Description", field.description.trim());
  }

  if (
    field.kind === "list" &&
    field.value.kind === "literal" &&
    Array.isArray(field.value.value) &&
    field.value.value.length === 0
  ) {
    const typeHint = getTypeHintForItemType(field.itemType);
    if (typeHint) {
      parameterDefinition.set("TypeHint", typeHint);
    }
  }

  for (const [key, value] of Object.entries(field.preservedData ?? {})) {
    parameterDefinition.set(key, cloneJsonLike(value));
  }

  return Object.fromEntries(parameterDefinition) as NpcParameterDefinitionJson;
}

function serializeSingleSectionField(section: NpcPropertySection): unknown {
  const field = section.fields[0];
  if (!field) {
    return undefined;
  }

  return serializeStructuredField(field);
}

export function serializeStructuredField(field: NpcPropertyField): unknown {
  if (field.isSet === false) {
    return undefined;
  }

  if (field.kind !== "richObject") {
    return serializeFieldValue(field.value);
  }

  if (field.structureKind === "array") {
    return (field.childFields ?? [])
      .map(childField => serializeStructuredField(childField))
      .filter((childValue): childValue is unknown => childValue !== undefined);
  }

  const objectEntries = new Map<string, unknown>();

  if (field.variantType) {
    objectEntries.set("Type", field.variantType);
  }

  const structuredFieldsByKey = new Map<string, unknown>();
  for (const childField of field.childFields ?? []) {
    if (field.variantType && childField.key === "Type") {
      continue;
    }

    if (childField.isSet === false) {
      continue;
    }

    const serializedChild = serializeStructuredField(childField);
    if (serializedChild !== undefined) {
      structuredFieldsByKey.set(childField.key, serializedChild);
    }
  }

  const orderedKeys = [
    ...(field.keyOrder ?? []).filter(
      key => structuredFieldsByKey.has(key) || key in (field.preservedData ?? {}),
    ),
    ...Array.from(structuredFieldsByKey.keys()).filter(
      key => !(field.keyOrder ?? []).includes(key),
    ),
    ...Object.keys(field.preservedData ?? {}).filter(key => !(field.keyOrder ?? []).includes(key)),
  ];

  for (const key of orderedKeys) {
    if (structuredFieldsByKey.has(key)) {
      objectEntries.set(key, structuredFieldsByKey.get(key));
      continue;
    }

    if (field.preservedData && key in field.preservedData) {
      objectEntries.set(key, cloneJsonLike(field.preservedData[key]));
    }
  }

  return Object.fromEntries(objectEntries);
}
