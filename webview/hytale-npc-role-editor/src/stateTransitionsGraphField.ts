import { cloneJsonLike } from "./propertyFieldUtilities";
import type { NpcPropertyField } from "./propertyTypes";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStaticComponentReferenceWrapper(value: unknown): boolean {
  return isObject(value) && typeof value.Reference === "string";
}

function isGraphCompatibleStateTransitionEntry(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }

  if ("States" in value) {
    if (!Array.isArray(value.States) || value.States.some(state => !isObject(state))) {
      return false;
    }
  }

  if ("Actions" in value) {
    const actions = value.Actions;
    if (!Array.isArray(actions) && !isStaticComponentReferenceWrapper(actions)) {
      return false;
    }

    if (Array.isArray(actions) && actions.some(action => !isObject(action))) {
      return false;
    }
  }

  return true;
}

function isGraphCompatibleStateTransitionsValue(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every(transition => isGraphCompatibleStateTransitionEntry(transition)))
  );
}

export function createStateTransitionsGraphField(value: unknown): NpcPropertyField {
  const isCompatible = isGraphCompatibleStateTransitionsValue(value);

  return {
    id: "top-level-StateTransitions",
    key: "StateTransitions",
    label: "State Transitions",
    fieldPath: "StateTransitions",
    kind: isCompatible ? "graph" : "rawJson",
    rootType: isCompatible ? "StateTransitions" : undefined,
    value: {
      kind: "literal",
      value: cloneJsonLike(value ?? []),
    },
    description: isCompatible
      ? "Graph view of state transition mappings and shared transition actions."
      : "StateTransitions contains unsupported JSON and is preserved as raw JSON.",
    computable: false,
    canRename: false,
    canChangeType: false,
    canUnset: true,
    isDescriptionEditable: false,
    isSet: value !== undefined,
    ui: {},
  };
}
