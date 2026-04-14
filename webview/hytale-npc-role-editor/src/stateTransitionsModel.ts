import type { NpcDescriptorDocument } from "@shared/npc-role-editor/descriptorTypes";
import { isRecord } from "./parsing/documentTypes";
import type {
  NpcFieldValue,
  NpcPropertyField,
  NpcStateTransitionEdge,
  NpcStateTransitionEntry,
} from "./propertyTypes";
import {
  cloneJsonLike,
  cloneOptionalFieldValue,
  createStateTransitionEdgeId,
  createStateTransitionEntryId,
  normalizeStringArray,
  parseOptionalBooleanFieldValue,
  serializeFieldValue,
} from "./propertyFieldUtilities";
import { createRichObjectField, syncStructuredFieldPaths } from "./richObjectFields";

export function isStateTransitionsField(field: NpcPropertyField): boolean {
  return field.kind === "stateTransitions";
}

export function createStateTransitionsField(
  value: unknown,
  descriptors: NpcDescriptorDocument,
): NpcPropertyField {
  if (value !== undefined && !Array.isArray(value)) {
    return {
      id: "state-transitions-root",
      key: "StateTransitions",
      label: "State Transitions",
      fieldPath: "StateTransitions",
      kind: "rawJson",
      value: {
        kind: "literal",
        value: cloneJsonLike(value ?? {}),
      },
      description:
        "StateTransitions is expected to be an ordered array. This value is preserved as raw JSON because it could not be parsed into the structured transition editor.",
      computable: false,
      canRename: false,
      canChangeType: false,
      canUnset: true,
      isDescriptionEditable: false,
      isSet: true,
      ui: {},
    };
  }

  const transitions = Array.isArray(value)
    ? value.map((entryValue, index) => createStateTransitionEntry(entryValue, index, descriptors))
    : [];

  return {
    id: "state-transitions-root",
    key: "StateTransitions",
    label: "State Transitions",
    fieldPath: "StateTransitions",
    kind: "stateTransitions",
    value: {
      kind: "literal",
      value: cloneJsonLike(Array.isArray(value) ? value : []),
    },
    description: "Ordered list of state transitions and their action lists.",
    transitions,
    computable: false,
    canRename: false,
    canChangeType: false,
    canUnset: true,
    isDescriptionEditable: false,
    isSet: value !== undefined,
    ui: {},
  };
}

export function serializeStateTransitionsField(
  field: NpcPropertyField,
  serializeStructuredField: (field: NpcPropertyField) => unknown,
): unknown[] {
  const transitions = field.transitions ?? [];
  return transitions.map(transition => {
    const transitionObject = new Map<string, unknown>();

    if (transition.comment?.trim()) {
      transitionObject.set("$Comment", transition.comment.trim());
    }

    const serializedEnabled = serializeOptionalFieldValue(transition.enabled);
    if (serializedEnabled !== undefined) {
      transitionObject.set("Enabled", serializedEnabled);
    }

    transitionObject.set(
      "States",
      transition.edges.map(edge => {
        const edgeObject = new Map<string, unknown>();
        edgeObject.set("From", [...edge.from]);
        edgeObject.set("To", [...edge.to]);

        if (typeof edge.priority === "number") {
          edgeObject.set("Priority", edge.priority);
        }

        const serializedEdgeEnabled = serializeOptionalFieldValue(edge.enabled);
        if (serializedEdgeEnabled !== undefined) {
          edgeObject.set("Enabled", serializedEdgeEnabled);
        }

        for (const [key, value] of Object.entries(edge.preservedData ?? {})) {
          edgeObject.set(key, cloneJsonLike(value));
        }

        return Object.fromEntries(edgeObject);
      }),
    );

    const serializedActions = serializeStructuredField(transition.actionsField);
    transitionObject.set("Actions", serializedActions ?? []);

    for (const [key, value] of Object.entries(transition.preservedData ?? {})) {
      transitionObject.set(key, cloneJsonLike(value));
    }

    return Object.fromEntries(transitionObject);
  });
}

export function syncStateTransitionsFieldPaths(field: NpcPropertyField): void {
  if (field.kind !== "stateTransitions") {
    return;
  }

  (field.transitions ?? []).forEach((transition, transitionIndex) => {
    transition.id = createStateTransitionEntryId(transitionIndex);
    transition.actionsField.key = "Actions";
    transition.actionsField.label = "Actions";
    transition.actionsField.fieldPath = `${field.fieldPath}[${transitionIndex}].Actions`;
    syncStructuredFieldPaths(transition.actionsField);

    transition.edges.forEach((edge, edgeIndex) => {
      edge.id = createStateTransitionEdgeId(edgeIndex);
    });
  });
}

export function addStateTransition(
  field: NpcPropertyField,
  descriptors: NpcDescriptorDocument,
): boolean {
  if (field.kind !== "stateTransitions") {
    return false;
  }

  const nextTransitions = [...(field.transitions ?? [])];
  nextTransitions.push(createDefaultStateTransitionEntry(nextTransitions.length, descriptors));
  field.transitions = nextTransitions;
  field.isSet = true;
  field.value = { kind: "literal", value: [] };
  syncStateTransitionsFieldPaths(field);
  return true;
}

export function removeStateTransition(field: NpcPropertyField, transitionId: string): boolean {
  if (field.kind !== "stateTransitions") {
    return false;
  }

  const nextTransitions = (field.transitions ?? []).filter(transition => transition.id !== transitionId);
  if (nextTransitions.length === (field.transitions ?? []).length) {
    return false;
  }

  field.transitions = nextTransitions;
  if (nextTransitions.length === 0) {
    field.isSet = false;
  }
  syncStateTransitionsFieldPaths(field);
  return true;
}

export function reorderStateTransitions(
  field: NpcPropertyField,
  orderedTransitionIds: string[],
): boolean {
  if (field.kind !== "stateTransitions") {
    return false;
  }

  const transitions = field.transitions ?? [];
  const reorderedTransitions = orderedTransitionIds
    .map(transitionId => transitions.find(transition => transition.id === transitionId))
    .filter((transition): transition is NpcStateTransitionEntry => Boolean(transition));

  if (reorderedTransitions.length !== transitions.length) {
    return false;
  }

  field.transitions = reorderedTransitions;
  syncStateTransitionsFieldPaths(field);
  return true;
}

export function addStateTransitionEdge(field: NpcPropertyField, transitionId: string): boolean {
  const transition = findStateTransition(field, transitionId);
  if (!transition) {
    return false;
  }

  transition.edges = [...transition.edges, createDefaultStateTransitionEdge(transition.edges.length)];
  syncStateTransitionsFieldPaths(field);
  return true;
}

export function removeStateTransitionEdge(
  field: NpcPropertyField,
  transitionId: string,
  edgeId: string,
): boolean {
  const transition = findStateTransition(field, transitionId);
  if (!transition) {
    return false;
  }

  const nextEdges = transition.edges.filter(edge => edge.id !== edgeId);
  if (nextEdges.length === transition.edges.length) {
    return false;
  }

  transition.edges = nextEdges;
  syncStateTransitionsFieldPaths(field);
  return true;
}

export function reorderStateTransitionEdges(
  field: NpcPropertyField,
  transitionId: string,
  orderedEdgeIds: string[],
): boolean {
  const transition = findStateTransition(field, transitionId);
  if (!transition) {
    return false;
  }

  const reorderedEdges = orderedEdgeIds
    .map(edgeId => transition.edges.find(edge => edge.id === edgeId))
    .filter((edge): edge is NpcStateTransitionEdge => Boolean(edge));

  if (reorderedEdges.length !== transition.edges.length) {
    return false;
  }

  transition.edges = reorderedEdges;
  syncStateTransitionsFieldPaths(field);
  return true;
}

export function updateStateTransitionComment(
  field: NpcPropertyField,
  transitionId: string,
  comment: string,
): boolean {
  const transition = findStateTransition(field, transitionId);
  if (!transition) {
    return false;
  }

  const normalizedComment = comment.trim() || undefined;
  if (transition.comment === normalizedComment) {
    return false;
  }

  transition.comment = normalizedComment;
  return true;
}

export function updateStateTransitionEnabled(
  field: NpcPropertyField,
  transitionId: string,
  enabled: NpcFieldValue | undefined,
): boolean {
  const transition = findStateTransition(field, transitionId);
  if (!transition) {
    return false;
  }

  transition.enabled = cloneOptionalFieldValue(enabled);
  return true;
}

export function updateStateTransitionEdgeStates(
  field: NpcPropertyField,
  transitionId: string,
  edgeId: string,
  direction: "from" | "to",
  nextValues: string[],
): boolean {
  const edge = findStateTransitionEdge(field, transitionId, edgeId);
  if (!edge) {
    return false;
  }

  edge[direction] = [...nextValues];
  return true;
}

export function updateStateTransitionEdgePriority(
  field: NpcPropertyField,
  transitionId: string,
  edgeId: string,
  priority: number | undefined,
): boolean {
  const edge = findStateTransitionEdge(field, transitionId, edgeId);
  if (!edge) {
    return false;
  }

  edge.priority = priority;
  return true;
}

export function updateStateTransitionEdgeEnabled(
  field: NpcPropertyField,
  transitionId: string,
  edgeId: string,
  enabled: NpcFieldValue | undefined,
): boolean {
  const edge = findStateTransitionEdge(field, transitionId, edgeId);
  if (!edge) {
    return false;
  }

  edge.enabled = cloneOptionalFieldValue(enabled);
  return true;
}

function createStateTransitionEntry(
  value: unknown,
  index: number,
  descriptors: NpcDescriptorDocument,
): NpcStateTransitionEntry {
  const rawTransition = isRecord(value) ? value : {};
  const rawEdges = Array.isArray(rawTransition.States) ? rawTransition.States : [];
  const preservedData = Object.fromEntries(
    Object.entries(rawTransition)
      .filter(([key]) => key !== "$Comment" && key !== "Enabled" && key !== "States" && key !== "Actions")
      .map(([key, childValue]) => [key, cloneJsonLike(childValue)]),
  );

  return {
    id: createStateTransitionEntryId(index),
    comment: typeof rawTransition.$Comment === "string" && rawTransition.$Comment.trim()
      ? rawTransition.$Comment
      : undefined,
    enabled: parseOptionalBooleanFieldValue(rawTransition.Enabled),
    edges: rawEdges.map((edgeValue, edgeIndex) => createStateTransitionEdge(edgeValue, edgeIndex)),
    actionsField: createRichObjectField({
      key: "Actions",
      label: "Actions",
      fieldPath: `StateTransitions[${index}].Actions`,
      shapeKey: "ActionList",
      value: rawTransition.Actions,
      descriptors,
      description: "Actions to run when this transition triggers.",
      canUnset: false,
      isSet: rawTransition.Actions !== undefined,
    }),
    preservedData: Object.keys(preservedData).length > 0 ? preservedData : undefined,
    ui: {},
  };
}

function createStateTransitionEdge(
  value: unknown,
  index: number,
): NpcStateTransitionEdge {
  const rawEdge = isRecord(value) ? value : {};
  const preservedData = Object.fromEntries(
    Object.entries(rawEdge)
      .filter(([key]) => key !== "From" && key !== "To" && key !== "Priority" && key !== "Enabled")
      .map(([key, childValue]) => [key, cloneJsonLike(childValue)]),
  );

  return {
    id: createStateTransitionEdgeId(index),
    from: normalizeStringArray(rawEdge.From),
    to: normalizeStringArray(rawEdge.To),
    priority: typeof rawEdge.Priority === "number" ? rawEdge.Priority : undefined,
    enabled: parseOptionalBooleanFieldValue(rawEdge.Enabled),
    preservedData: Object.keys(preservedData).length > 0 ? preservedData : undefined,
  };
}

function createDefaultStateTransitionEntry(
  index: number,
  descriptors: NpcDescriptorDocument,
): NpcStateTransitionEntry {
  return {
    id: createStateTransitionEntryId(index),
    edges: [createDefaultStateTransitionEdge(0)],
    actionsField: createRichObjectField({
      key: "Actions",
      label: "Actions",
      fieldPath: `StateTransitions[${index}].Actions`,
      shapeKey: "ActionList",
      value: [],
      descriptors,
      description: "Actions to run when this transition triggers.",
      canUnset: false,
      isSet: true,
      seedDefaults: false,
    }),
    ui: {},
  };
}

function createDefaultStateTransitionEdge(index: number): NpcStateTransitionEdge {
  return {
    id: createStateTransitionEdgeId(index),
    from: [],
    to: [],
  };
}

function findStateTransition(
  field: NpcPropertyField,
  transitionId: string,
): NpcStateTransitionEntry | undefined {
  if (field.kind !== "stateTransitions") {
    return undefined;
  }

  return (field.transitions ?? []).find(transition => transition.id === transitionId);
}

function findStateTransitionEdge(
  field: NpcPropertyField,
  transitionId: string,
  edgeId: string,
): NpcStateTransitionEdge | undefined {
  return findStateTransition(field, transitionId)?.edges.find(edge => edge.id === edgeId);
}

function serializeOptionalFieldValue(value: NpcFieldValue | undefined): unknown {
  if (!value) {
    return undefined;
  }

  return serializeFieldValue(value);
}
