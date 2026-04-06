import type {
  NpcDocument,
  NpcParameters,
  NpcStandardParameterEditorType,
  NpcStandardParameterEntry,
  NpcStandardParameterValue,
} from "./documentTypes";
import {
  coerceStandardParameterValueForEditorType,
  getTypeHintForEditorType,
} from "./parameterEditorTypes";

const DEFAULT_NEW_PARAMETER_NAME = "Parameter";

export function ensureNpcParameters(document: NpcDocument): NpcParameters {
  if (document.parameters) {
    return document.parameters;
  }

  document.parameters = {
    entries: [],
    excludedEntries: {},
    keyOrder: [],
  };

  return document.parameters;
}

export function addStandardParameter(document: NpcDocument): string {
  const parameters = ensureNpcParameters(document);
  const name = getNextStandardParameterName(parameters);

  parameters.entries = [
    ...parameters.entries,
    createDefaultStandardParameterEntry(name),
  ];
  parameters.keyOrder = [...parameters.keyOrder, name];

  return name;
}

export function removeStandardParameter(parameters: NpcParameters, parameterName: string): boolean {
  const nextEntries = parameters.entries.filter(entry => entry.name !== parameterName);
  if (nextEntries.length === parameters.entries.length) {
    return false;
  }

  parameters.entries = nextEntries;
  parameters.keyOrder = parameters.keyOrder.filter(key => key !== parameterName);
  return true;
}

export function renameStandardParameter(
  parameters: NpcParameters,
  currentName: string,
  nextName: string,
): boolean {
  const trimmedName = nextName.trim();
  if (!trimmedName || trimmedName === currentName) {
    return false;
  }

  const entry = parameters.entries.find(candidate => candidate.name === currentName);
  if (!entry || hasParameterNameCollision(parameters, trimmedName, currentName)) {
    return false;
  }

  entry.name = trimmedName;
  parameters.keyOrder = parameters.keyOrder.map(key => (key === currentName ? trimmedName : key));
  return true;
}

export function reorderStandardParameters(
  parameters: NpcParameters,
  orderedParameterNames: string[],
): boolean {
  if (orderedParameterNames.length !== parameters.entries.length) {
    return false;
  }

  const entriesByName = new Map(parameters.entries.map(entry => [entry.name, entry]));
  if (
    orderedParameterNames.some(name => !entriesByName.has(name)) ||
    new Set(orderedParameterNames).size !== orderedParameterNames.length
  ) {
    return false;
  }

  parameters.entries = orderedParameterNames.map(name => entriesByName.get(name)!);

  let nextStandardIndex = 0;
  parameters.keyOrder = parameters.keyOrder.map(key => {
    if (!entriesByName.has(key)) {
      return key;
    }

    return orderedParameterNames[nextStandardIndex++] ?? key;
  });

  return true;
}

export function updateStandardParameterEditorType(
  parameters: NpcParameters,
  parameterName: string,
  nextType: Exclude<NpcStandardParameterEditorType, "rawJson">,
): boolean {
  const entry = parameters.entries.find(candidate => candidate.name === parameterName);
  if (!entry) {
    return false;
  }

  entry.value = coerceStandardParameterValueForEditorType(entry.value, nextType);
  entry.typeHint = getTypeHintForEditorType(nextType);
  return true;
}

export function createDefaultStandardParameterEntry(
  name: string,
  value: NpcStandardParameterValue = {
    kind: "literal",
    value: "",
  },
): NpcStandardParameterEntry {
  return {
    name,
    value,
    keyOrder: ["Value"],
    extraFields: {},
  };
}

function getNextStandardParameterName(parameters: NpcParameters): string {
  const usedNames = new Set([
    ...parameters.entries.map(entry => entry.name),
    ...Object.keys(parameters.excludedEntries),
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
  parameters: NpcParameters,
  candidateName: string,
  currentName: string,
): boolean {
  if (candidateName === currentName) {
    return false;
  }

  if (candidateName in parameters.excludedEntries) {
    return true;
  }

  return parameters.entries.some(entry => entry.name === candidateName && entry.name !== currentName);
}
