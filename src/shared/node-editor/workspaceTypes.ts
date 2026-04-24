import { type IndexReference } from "../indexTypes";
import type { NpcAnimationAutocompleteKind } from "../npc-role-editor/animationAutocomplete";
import type { NpcStateAutocompleteKind } from "../npc-role-editor/stateAutocomplete";

export type FieldComponentType =
  | "checkbox"
  | "enum"
  | "string"
  | "text" // text is multi-line string
  | "filepath"
  | "list"
  | "parameterMap"
  | "int"
  | "float"
  | "object"
  | "intslider"
  | "color";

export type NodeSchemaSerializationType = "child" | "root" | "sibling";
export type NodeSlotOccupancy = "whole-slot";
export interface NodeConnectionTypeDefinition {
  Extends?: string[];
}
export interface NodeConnectionType {
  extends: string[];
  ancestors: string[];
}
export type GraphRootAdaptationResult = {
  value: unknown;
  preservedData?: Record<string, unknown>;
};
export interface NodeEditorWorkspaceRootDefinition {
  RootNodeType: string;
  MenuName: string;
  AllowedCategories?: string[];
  AllowedTemplates?: string[];
}

export interface VariantKindDefinition {
  VariantFieldName: string;
  DefaultTemplateId?: string;
  // maps node[VariantFieldName] -> template ID
  Variants: Record<string, string>;
}

// exported data for node field (aka "Conent" in template definition)
export interface NodeField {
  schemaKey: string | null;
  type: FieldComponentType;
  label?: string;
  description?: string;
  value?: unknown;
  defaultValue?: unknown;
  computable?: boolean;
  /** Represents whether a field is implied from an absent value when initially parsed. Used to preserve explicitly empty values. */
  isImplicit?: boolean;
  /** Whether this field exists explicitly in the serialized document. */
  isSet: boolean;
  inputWidth?: number;
  overrideAutocompleteValues?: string[];
  subfields?: NodeField[];
  localId: string;
  symbolLookup?: IndexReference;
  parameterMapKeyOverrideAutocompleteValues?: string[];
  parameterMapKeySymbolLookup?: IndexReference;
  stateAutocompleteKind?: NpcStateAutocompleteKind;
  animationAutocompleteKind?: NpcAnimationAutocompleteKind;
  previewFeatureKind?: "animation";
}

export interface NodePin {
  schemaKey: string;
  label?: string;
  description?: string;
  color?: string;
  connectionType: string;
  localId: string;
  multiplicity: "single" | "multiple" | "map";
  fields?: NodeField[];
}

export interface NodeChildSchema {
  schemaKey: string;
  targetTemplateOrVariantId: string;
  serializationType: NodeSchemaSerializationType;
  allowComponentReferences?: boolean;
}

// processed template for optimized usage. only uses schema keys, Content/Pin local keys are abstracted.
export interface NodeTemplate {
  templateId: string;
  defaultTitle: string;
  description?: string;
  category?: string;
  // schema key -> child node schema info
  childSchemas: Record<string, NodeChildSchema>;
  // schemaKey -> NodeField
  fieldsBySchemaKey: Record<string, NodeField>;
  inputPins: NodePin[];
  outputPins: NodePin[];
  // constants defined in Schema, e.g. Type -> "Biome"
  schemaConstants: Record<string, string>;
  nodeColor?: string;
  isComponentReference?: true;
  componentReferenceClass?: string;
  slotOccupancy?: NodeSlotOccupancy;
}

export interface NodeEditorWorkspace {
  workspaceName: string;
  roots: Record<string, NodeEditorWorkspaceRootDefinition>;
  templateCategories: Record<string, string[]>;
  nodeTemplatesById: Record<string, NodeTemplate>;
  variantKindsById: Record<string, VariantKindDefinition>;
  connectionTypesById: Record<string, NodeConnectionType>;
}

export interface NodeEditorWorkspaceContext {
  rootTemplateOrVariantId: string;
  nodeTemplatesById: Record<string, NodeTemplate>;
  // used to save $WorkspaceID - defined per root
  rootMenuName: string;
  // category name -> list of template IDs
  templateCategories: Record<string, string[]>;
  variantKindsById: Record<string, VariantKindDefinition>;
  connectionTypesById: Record<string, NodeConnectionType>;
}
