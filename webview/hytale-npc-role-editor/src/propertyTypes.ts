import type { IndexReference } from "@shared/indexTypes";
import type { NpcStateAutocompleteKind } from "@shared/npc-role-editor/stateAutocomplete";
import type { NpcRoleType, NpcComponentClass } from "./parsing/documentTypes";

export type NpcFieldValue =
  | { kind: "literal"; value: unknown }
  | { kind: "compute"; expression: string };

export type NpcFieldKind =
  | "string"
  | "number"
  | "boolean"
  | "list"
  | "rawJson"
  | "graph"
  | "richObject"
  | "stateTransitions";

export type NpcSectionId =
  | "parameters"
  | "roleAttributes"
  | "variantReference"
  | "modify"
  | "componentMeta"
  | "content"
  | "instructions"
  | "interactionInstruction"
  | "deathInstruction"
  | "motionControllerList"
  | "stateTransitions";

export type NpcFieldUiState = {
  collapsed?: boolean;
};

export type NpcSectionUiState = {
  collapsed?: boolean;
};

export type NpcStateTransitionEdge = {
  id: string;
  from: string[];
  to: string[];
  priority?: number;
  enabled?: NpcFieldValue;
  preservedData?: Record<string, unknown>;
};

export type NpcStateTransitionEntry = {
  id: string;
  comment?: string;
  enabled?: NpcFieldValue;
  edges: NpcStateTransitionEdge[];
  actionsField: NpcPropertyField;
  preservedData?: Record<string, unknown>;
  ui?: NpcFieldUiState;
};

export type NpcPropertyField = {
  id: string;
  key: string;
  label: string;
  fieldPath: string;
  kind: NpcFieldKind;
  value: NpcFieldValue;
  rootType?: string;
  // `richObject` is an NPC-specific structured content editor. It is descriptor-driven,
  // not the same thing as the asset editor's generic ObjectField, and it can represent
  // nested arrays and nested typed objects despite the name.
  shapeKey?: string;
  structureKind?: "object" | "array";
  childFields?: NpcPropertyField[];
  keyOrder?: string[];
  itemShapeKey?: string;
  variantType?: string | null;
  typeSuggestions?: string[];
  description?: string;
  required?: boolean;
  isSet?: boolean;
  computable?: boolean;
  transitions?: NpcStateTransitionEntry[];
  canRename?: boolean;
  canChangeType?: boolean;
  canUnset?: boolean;
  isDescriptionEditable?: boolean;
  itemType?: "string" | "number" | "boolean";
  staticSuggestions?: string[];
  symbolRef?: IndexReference;
  stateAutocompleteKind?: NpcStateAutocompleteKind;
  preservedData?: Record<string, unknown>;
  ui?: NpcFieldUiState;
};

export type NpcPropertySection = {
  id: NpcSectionId;
  name: string;
  description?: string;
  reorderable?: boolean;
  fields: NpcPropertyField[];
  preservedFields?: Record<string, unknown>;
  keyOrder?: string[];
  ui?: NpcSectionUiState;
};

export type NpcPropertyState = {
  roleType: NpcRoleType;
  componentClass: NpcComponentClass | null;
  sections: NpcPropertySection[];
  preservedTopLevelFields: Record<string, unknown>;
  topLevelKeyOrder: string[];
};
