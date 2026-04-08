import {
  coerceFieldStateForStandardParameterEditorType,
  type NpcStandardParameterEditorType,
} from "./parameterEditorTypes";
import {
  createDefaultParameterField,
  type NpcPropertyField,
  type NpcPropertySection,
} from "../propertyModel";

const DEFAULT_NEW_PARAMETER_NAME = "Parameter";

export function addStandardParameter(section: NpcPropertySection): string {
  const nextName = getNextStandardParameterName(section);
  section.fields = [...section.fields, createDefaultParameterField(nextName)];
  section.keyOrder = [...(section.keyOrder ?? []), nextName];
  return nextName;
}

export function removeStandardParameter(
  section: NpcPropertySection,
  parameterName: string,
): boolean {
  const nextFields = section.fields.filter(
    field => !(isStandardParameterField(field) && field.key === parameterName),
  );
  if (nextFields.length === section.fields.length) {
    return false;
  }

  section.fields = nextFields;
  section.keyOrder = (section.keyOrder ?? []).filter(key => key !== parameterName);
  return true;
}

export function renameStandardParameter(
  section: NpcPropertySection,
  currentName: string,
  nextName: string,
): boolean {
  const trimmedName = nextName.trim();
  if (!trimmedName || trimmedName === currentName) {
    return false;
  }

  if (hasParameterNameCollision(section, trimmedName, currentName)) {
    return false;
  }

  const field = section.fields.find(
    candidate => isStandardParameterField(candidate) && candidate.key === currentName,
  );
  if (!field) {
    return false;
  }

  field.key = trimmedName;
  field.label = trimmedName;
  field.fieldPath = `Parameters.${trimmedName}.Value`;
  section.keyOrder = (section.keyOrder ?? []).map(key =>
    key === currentName ? trimmedName : key,
  );
  return true;
}

export function reorderStandardParameters(
  section: NpcPropertySection,
  orderedParameterNames: string[],
): boolean {
  const standardFields = section.fields.filter(isStandardParameterField);
  if (orderedParameterNames.length !== standardFields.length) {
    return false;
  }

  const fieldsByName = new Map(standardFields.map(field => [field.key, field]));
  if (
    orderedParameterNames.some(name => !fieldsByName.has(name)) ||
    new Set(orderedParameterNames).size !== orderedParameterNames.length
  ) {
    return false;
  }

  const specialFields = section.fields.filter(field => !isStandardParameterField(field));
  section.fields = [
    ...specialFields,
    ...orderedParameterNames.map(name => fieldsByName.get(name)!),
  ];

  let nextStandardIndex = 0;
  section.keyOrder = (section.keyOrder ?? []).map(key =>
    fieldsByName.has(key) ? (orderedParameterNames[nextStandardIndex++] ?? key) : key,
  );

  return true;
}

export function updateStandardParameterEditorType(
  section: NpcPropertySection,
  parameterName: string,
  nextType: NpcStandardParameterEditorType,
): boolean {
  const field = section.fields.find(
    candidate => isStandardParameterField(candidate) && candidate.key === parameterName,
  );
  if (!field) {
    return false;
  }

  const nextState = coerceFieldStateForStandardParameterEditorType(field.value, nextType);
  field.kind = nextState.kind;
  field.value = nextState.value;
  field.itemType = nextState.itemType;
  field.isSet = true;
  return true;
}

export function updateStandardParameterDescription(
  section: NpcPropertySection,
  parameterName: string,
  nextDescription: string,
): boolean {
  const field = section.fields.find(
    candidate => isStandardParameterField(candidate) && candidate.key === parameterName,
  );
  if (!field) {
    return false;
  }

  const trimmedDescription = nextDescription.trim();
  const normalizedDescription = trimmedDescription || undefined;
  if (field.description === normalizedDescription) {
    return false;
  }

  field.description = normalizedDescription;
  return true;
}

export function isStandardParameterField(field: NpcPropertyField): boolean {
  return field.fieldPath.startsWith("Parameters.") && field.key !== "_ImportStates";
}

function getNextStandardParameterName(section: NpcPropertySection): string {
  const usedNames = new Set([
    ...section.fields.filter(isStandardParameterField).map(field => field.key),
    ...Object.keys(section.preservedFields ?? {}),
  ]);

  if (!usedNames.has(DEFAULT_NEW_PARAMETER_NAME)) {
    return DEFAULT_NEW_PARAMETER_NAME;
  }

  let index = 2;
  while (usedNames.has(`${DEFAULT_NEW_PARAMETER_NAME} ${index}`)) {
    index += 1;
  }

  return `${DEFAULT_NEW_PARAMETER_NAME} ${index}`;
}

function hasParameterNameCollision(
  section: NpcPropertySection,
  candidateName: string,
  currentName: string,
): boolean {
  if (candidateName === currentName) {
    return false;
  }

  if (candidateName in (section.preservedFields ?? {})) {
    return true;
  }

  return section.fields.some(
    field => isStandardParameterField(field) && field.key === candidateName,
  );
}
