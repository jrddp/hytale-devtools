import { type IndexReference } from "../indexTypes";

export type FieldComponentType =
  | "checkbox"
  | "enum"
  | "string"
  | "text" // text is multi-line string
  | "filepath"
  | "list"
  | "int"
  | "float"
  | "object"
  | "intslider"
  | "color";
export interface NodeEditorWorkspaceRootDefinition {
  RootNodeType: string;
  MenuName: string;
}

export interface VariantKindDefinition {
  VariantFieldName: string;
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
  /** Represents whether a field is implied from an absent value when initially parsed. Used to preserve explicitly empty values. */
  isImplicit?: boolean;
  inputWidth?: number;
  overrideAutocompleteValues?: string[];
  subfields?: NodeField[];
  localId: string;
  symbolLookup?: IndexReference;
}

export interface NodePin {
  schemaKey: string; // null for input pins
  label?: string;
  description?: string;
  color?: string;
  connectionType: string;
  localId: string;
  multiplicity: "single" | "multiple" | "map";
  fields?: NodeField[];
}

// processed template for optimized usage. only uses schema keys, Content/Pin local keys are abstracted.
export interface NodeTemplate {
  templateId: string;
  defaultTitle: string;
  description?: string;
  category?: string;
  // schema key -> VariantKind or TemplateID for that child
  childTypes: Record<string, string>;
  // schemaKey -> NodeField
  fieldsBySchemaKey: Record<string, NodeField>;
  inputPins: NodePin[];
  outputPins: NodePin[];
  // constants defined in Schema, e.g. Type -> "Biome"
  schemaConstants: Record<string, string>;
  nodeColor?: string;
}

export interface NodeEditorWorkspace {
  workspaceName: string;
  roots: Record<string, NodeEditorWorkspaceRootDefinition>;
  templateCategories: Record<string, string[]>;
  nodeTemplatesById: Record<string, NodeTemplate>;
  variantKindsById: Record<string, VariantKindDefinition>;
}

export interface NodeEditorWorkspaceContext {
  rootTemplateOrVariantId: string;
  nodeTemplatesById: Record<string, NodeTemplate>;
  // used to save $WorkspaceID - defined per root
  rootMenuName: string;
  // category name -> list of template IDs
  templateCategories: Record<string, string[]>;
  variantKindsById: Record<string, VariantKindDefinition>;
}
