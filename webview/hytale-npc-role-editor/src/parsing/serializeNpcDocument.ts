import type { NpcDocument, NpcStandardParameterEntry, NpcStandardParameterValue } from "./documentTypes";

const DEFAULT_JSON_INDENT = 2;

export function serializeNpcDocument(document: NpcDocument): Record<string, unknown> {
  const nextRoot = structuredClone(document.rawRoot);

  if (!document.parameters) {
    return nextRoot;
  }

  nextRoot.Parameters = serializeParameters(document);
  return nextRoot;
}

export function serializeNpcDocumentText(document: NpcDocument): string {
  return `${JSON.stringify(serializeNpcDocument(document), null, DEFAULT_JSON_INDENT)}\n`;
}

export function serializeStandardParameterValue(value: NpcStandardParameterValue): unknown {
  if (value.kind === "compute") {
    return {
      Compute: value.expression,
    };
  }

  return structuredClone(value.value);
}

function serializeParameters(document: NpcDocument): Record<string, unknown> {
  const parameters = document.parameters;
  if (!parameters) {
    return {};
  }

  const standardEntriesByName = new Map(
    parameters.entries.map(entry => [entry.name, serializeStandardParameterEntry(entry)]),
  );
  const serializedEntries = new Map<string, unknown>();

  for (const key of parameters.keyOrder) {
    if (key === "_ImportStates" && parameters.importStates !== null) {
      serializedEntries.set(key, structuredClone(parameters.importStates));
      continue;
    }

    if (standardEntriesByName.has(key)) {
      serializedEntries.set(key, standardEntriesByName.get(key));
      continue;
    }

    if (key in parameters.excludedEntries) {
      serializedEntries.set(key, structuredClone(parameters.excludedEntries[key]));
    }
  }

  for (const entry of parameters.entries) {
    if (!serializedEntries.has(entry.name)) {
      serializedEntries.set(entry.name, serializeStandardParameterEntry(entry));
    }
  }

  if (parameters.importStates !== null && !serializedEntries.has("_ImportStates")) {
    serializedEntries.set("_ImportStates", structuredClone(parameters.importStates));
  }

  for (const [key, value] of Object.entries(parameters.excludedEntries)) {
    if (!serializedEntries.has(key)) {
      serializedEntries.set(key, structuredClone(value));
    }
  }

  return Object.fromEntries(serializedEntries);
}

function serializeStandardParameterEntry(entry: NpcStandardParameterEntry): Record<string, unknown> {
  const fieldsByKey = new Map<string, unknown>();

  fieldsByKey.set("Value", serializeStandardParameterValue(entry.value));

  if (entry.keyOrder.includes("Description") || entry.description !== undefined) {
    fieldsByKey.set("Description", entry.description);
  }

  if (entry.keyOrder.includes("TypeHint") || entry.typeHint !== undefined) {
    fieldsByKey.set("TypeHint", entry.typeHint);
  }

  if (entry.keyOrder.includes("Private") || entry.private !== undefined) {
    fieldsByKey.set("Private", entry.private);
  }

  for (const [key, value] of Object.entries(entry.extraFields)) {
    fieldsByKey.set(key, structuredClone(value));
  }

  const orderedKeys = [
    ...entry.keyOrder.filter(key => fieldsByKey.has(key)),
    ...Array.from(fieldsByKey.keys()).filter(key => !entry.keyOrder.includes(key)),
  ];

  return Object.fromEntries(orderedKeys.map(key => [key, fieldsByKey.get(key)]));
}
