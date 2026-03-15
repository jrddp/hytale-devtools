import {
  type NodeEditorWorkspaceRootDefinition,
  type VariantKindDefinition,
} from "../shared/node-editor/workspaceTypes";

// definition as its stored in workspace node jsons
export type NodeTemplateDefinition = {
  Id: string;
  Title: string;
  Color: string;
  Description?: string;
  Content?: NodeContentDefinition[];
  Outputs?: NodePinDefinition[];
  Inputs?: NodePinDefinition[];
  Schema?: NodeSchemaDefinition;
  IsReference?: true;
  FileRefKey?: string;
  FileRefValue?: string;
  ModifyKey?: string;
  [key: string]: unknown;
};

export type NodeTemplateDescriptionSupplementDefinition = {
  Id: string;
  Description?: string;
};

export type NodeTemplateSupplementDefinition = {
  $ref?: string;
  Description?: string;
  Content?: NodeTemplateDescriptionSupplementDefinition[];
  Outputs?: NodeTemplateDescriptionSupplementDefinition[];
};

export interface NodePinDefinition {
  Id: string;
  Type: string;
  Color: string;
  Description?: string;
  Label?: string;
  Multiple?: boolean;
  IsMap?: boolean;
  Fields?: NodeContentDefinition[];
}

// structure of _Workspace.json
export interface NodeEditorWorkspaceDefinition {
  // unique identifier
  WorkspaceName: string;
  // unsure what this does
  ExportDefaults?: boolean;
  // roots depend on the asset type, resolved by resource path
  Roots?: Record<string, NodeEditorWorkspaceRootDefinition>;
  // categories for add menu, category -> TemplateIds
  NodeCategories?: Record<string, string[]>;
  // groups of node template IDs that define what nodes can be connected to each other
  // VariantFieldName determines which field in a node (e.g. "Type" or "Id") identifies its variant
  Variants?: Record<string, VariantKindDefinition>;
}

export interface WorkspacePathRule {
  workspaceName: string;
  rootId: string;
}

export type NodeContentDefinitionType =
  | "SmallString"
  | "String"
  | "Float"
  | "Int"
  | "Integer"
  | "IntSlider"
  | "Checkbox"
  | "Bool"
  | "Enum"
  | "FilePath"
  | "List"
  | "Object";

export interface NodeContentDefinition {
  Id: string;
  Type: NodeContentDefinitionType;
  Description?: string;
  Options: {
    Description?: string;
    Label?: string;
    Default?: string | number | boolean;
    Width?: number;
    Height?: number;
    Values?: string[];
    Fields?: NodeContentDefinition[];
    LargeChange?: number;
    Max?: number;
    Min?: number;
    SmallChange?: number;
    TickFrequency?: number;
    Type?: "String" | "Float";
    ArrayElementType?: "DataSettingFlags";
    UseUUID?: boolean;
    DefaultValue?: string | number | boolean;
  };
}

export interface NodeSchemaDefinition {
  // keys are the strings to be saved in the schema itself
  // ! keys may be postfixed with ${identifier}, presumably indicating a shared schemaKey that can be set by either a field OR a pin.
  // ! this is only seen in the demo workspace so far - which also notably includes unique ContentDefinition for Reference.json that may be related
  // ! See Demo Workspace DemoNode.json and Reference.json for reference.
  // TODO research and handle that properly ^. since its unused, for now we'll just strip any $postfixes from the schema keys during processing.
  [key: string]:
    | {
        Node?: string;
        Pin?: string;
        // they mix casings in workspaces sometimes.. e.g. ScriptableBrushes Root.json
        node?: string;
        pin?: string;
      }
    | string;
}
