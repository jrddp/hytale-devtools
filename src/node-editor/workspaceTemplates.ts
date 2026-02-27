import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { LOGGER, nodeEditorWorkspaces } from "../extension";
import { safeParseJSONFile } from "../shared/fileUtils";
import {
  type FieldComponentType,
  type NodeEditorWorkspace,
  type NodeEditorWorkspaceContext,
  type NodeEditorWorkspaceRootDefinition,
  type NodeField,
  type NodePin,
  type NodeTemplate,
  type VariantKindDefinition,
} from "../shared/node-editor/workspaceTypes";
import { type AssetDocumentShape } from "../shared/node-editor/assetTypes";

const WORKSPACE_PATH_RULES: Record<string, WorkspacePathRule> = {
  "/Server/ScriptedBrushes/": {
    workspaceName: "ScriptableBrushes",
    rootId: "DropList",
  },
  "/Server/HytaleGenerator/Biomes/": {
    workspaceName: "HytaleGenerator (Java)",
    rootId: "Biome",
  },
  "/Server/HytaleGenerator/Density/": {
    workspaceName: "HytaleGenerator (Java)",
    rootId: "Density",
  },
  "/Server/HytaleGenerator/MaterialMasks/": {
    workspaceName: "HytaleGenerator (Java)",
    rootId: "BlockMask",
  },
  "/Server/HytaleGenerator/Assignments/": {
    workspaceName: "HytaleGenerator (Java)",
    rootId: "Assignments",
  },
};

interface WorkspacePathRule {
  workspaceName: string;
  rootId: string;
}

type NodeContentDefinitionType =
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
  | "Object"
  | string;

interface NodeContentDefinition {
  Id: string;
  Type: NodeContentDefinitionType;
  Options?: {
    Label?: string;
    Default?: unknown;
    Width?: number;
    [key: string]: unknown;
  };
}

interface NodeSchemaDefinition {
  [key: string]:
    | {
        Node?: string;
        Pin?: string;
      }
    | string;
}

// definition as its stored in workspace node jsons
type NodeTemplateDefinition = {
  Id: string;
  Title?: string;
  Color?: string;
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

interface NodePinDefinition {
  Id: string;
  Type?: string;
  Color?: string;
  Label?: string;
  Multiple?: boolean;
  IsMap?: boolean;
}

// structure of _Workspace.json
interface NodeEditorWorkspaceDefinition {
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

function contentTypeToFieldComponentType(type: NodeContentDefinitionType): FieldComponentType {
  switch (type) {
    case "SmallString":
      return "string";
    case "String":
      return "text";
    case "Float":
      return "float";
    case "Int":
    case "Integer":
      return "int";
    case "IntSlider":
      return "intslider";
    case "Checkbox":
    case "Bool":
      return "checkbox";
    case "Enum":
      return "enum";
    case "FilePath":
      return "filepath";
    case "List":
      return "list";
    case "Object":
      return "object";
    default:
      return "string";
  }
}

// from exact json definition to optimized usage structure
function templateFromDefinition(definition: NodeTemplateDefinition): NodeTemplate {
  const fieldsByLocalId = definition.Content?.reduce(
    (map, content) => {
      map[content.Id] = {
        schemaKey: null,
        type: contentTypeToFieldComponentType(content.Type),
        label: content.Options?.Label,
        value: content.Options?.Default,
        inputWidth: content.Options?.Width,
      };
      return map;
    },
    {} as Record<string, NodeField>,
  );

  const inputPins: NodePin[] =
    definition.Inputs?.map(input => {
      return {
        schemaKey: null,
        localId: input.Id,
        label: input.Label,
        color: input.Color,
        type: input.IsMap ? "map" : input.Multiple ? "multiple" : "single",
      };
    }) ?? [];

  const outputPinsByLocalId =
    definition.Outputs?.reduce(
      (map, output) => {
        const type = output.IsMap ? "map" : output.Multiple ? "multiple" : "single";
        map[output.Id] = {
          schemaKey: null,
          localId: output.Id,
          label: output.Label,
          color: output.Color,
          type: type,
        };
        return map;
      },
      {} as Record<string, NodePin>,
    ) ?? {};

  const fieldsBySchemaKey: Record<string, NodeField> = {};
  const childTypes: Record<string, string> = {};
  const schemaConstants: Record<string, string> = {};

  for (const [schemaKey, entry] of Object.entries(definition.Schema ?? {})) {
    if (typeof entry === "string") {
      if (fieldsByLocalId?.[entry]) {
        // entry is local contentId
        fieldsByLocalId[entry].schemaKey = schemaKey;
        fieldsBySchemaKey[schemaKey] = fieldsByLocalId[entry];
      } else {
        // entry is a constant
        schemaConstants[schemaKey] = entry;
      }
    } else {
      // entry defines pin information
      if (entry.Pin && outputPinsByLocalId?.[entry.Pin]) {
        outputPinsByLocalId[entry.Pin].schemaKey = schemaKey;
      }
      if (entry.Node) {
        childTypes[schemaKey] = entry.Node;
      }
    }
  }

  return {
    templateId: definition.Id,
    defaultTitle: definition.Title,
    childTypes: childTypes,
    fieldsBySchemaKey: fieldsBySchemaKey,
    inputPins: inputPins,
    outputPins: Object.values(outputPinsByLocalId),
    schemaConstants: schemaConstants,
    nodeColor: definition.Color,
  };
}

export function getNodeEditorWorkspaces(fromPath: string): Record<string, NodeEditorWorkspace> {
  const workspaces: Record<string, NodeEditorWorkspace> = {};

  for (const directory of readdirSync(fromPath)) {
    const directoryPath = join(fromPath, directory);
    if (!statSync(directoryPath).isDirectory()) {
      continue;
    }

    const _workspace = join(directoryPath, "_Workspace.json");
    if (!existsSync(_workspace)) {
      LOGGER.warn(
        `Workspace template directory "${directoryPath}" is missing _Workspace.json file. Skipping.`,
      );
      continue;
    }

    const workspaceDefinition = safeParseJSONFile(_workspace) as NodeEditorWorkspaceDefinition;

    const templatesById: Record<string, NodeTemplate> = {};

    // recurse on each subdirectory
    const loadTemplates = (dir: string) => {
      for (const file of readdirSync(dir)) {
        if (file === "_Workspace.json") {
          continue;
        }

        const filePath = join(dir, file);

        if (statSync(filePath).isDirectory()) {
          loadTemplates(filePath);
        } else {
          const templateDefinition = safeParseJSONFile(filePath) as NodeTemplateDefinition;
          const template = templateFromDefinition(templateDefinition);
          templatesById[template.templateId] = template;
        }
      }
    };

    loadTemplates(directoryPath);

    for (const [category, templateList] of Object.entries(
      workspaceDefinition.NodeCategories ?? {},
    )) {
      for (const templateId of templateList) {
        if (!templatesById[templateId]) {
          LOGGER.warn(
            `Template "${templateId}" of category ${category} is missing from workspace "${workspaceDefinition.WorkspaceName}".`,
          );
          continue;
        }
        templatesById[templateId].category = category;
      }
    }

    workspaces[workspaceDefinition.WorkspaceName] = {
      workspaceName: workspaceDefinition.WorkspaceName,
      templateCategories: workspaceDefinition.NodeCategories ?? {},
      roots: workspaceDefinition.Roots ?? {},
      nodeTemplatesById: templatesById,
      variantKindsById: workspaceDefinition.Variants ?? {},
    };
  }

  return workspaces;
}

export function resolveWorkspaceContext(assetPath: string): NodeEditorWorkspaceContext | null {
  const subpathMatch = Object.keys(WORKSPACE_PATH_RULES).filter(subpath =>
    assetPath.includes(subpath),
  )[0];
  if (!subpathMatch) {
    return null;
  }

  const fileParse = safeParseJSONFile(assetPath) as AssetDocumentShape | undefined;
  // ! $WorkspaceID actually saves the root menuname. e.g. "HytaleGenerator - Biome"
  const parsedMenuName: string | undefined = fileParse?.$NodeEditorMetadata?.$WorkspaceID;
  let workspace: NodeEditorWorkspace | undefined;
  let rootDefinition: NodeEditorWorkspaceRootDefinition | undefined;
  // match root/workspace by menu name. could be optimized but real world size would never be very large
  if (parsedMenuName) {
    let found = false;
    for (const currentWorkspace of Object.values(nodeEditorWorkspaces)) {
      if (found) {
        break;
      }
      for (const root of Object.values(currentWorkspace.roots)) {
        if (root.MenuName === parsedMenuName) {
          workspace = currentWorkspace;
          rootDefinition = root;
          found = true;
          break;
        }
      }
    }
  }

  if (!workspace || !rootDefinition) {
    const matchedRule = WORKSPACE_PATH_RULES[subpathMatch];
    workspace = nodeEditorWorkspaces[matchedRule.workspaceName];
    if (!workspace) {
      return null;
    }
    rootDefinition = workspace.roots[matchedRule.rootId];
    if (!rootDefinition) {
      LOGGER.warn(
        `Root definition "${matchedRule.rootId}" not found in workspace "${workspace.workspaceName} when resolving ${assetPath}".`,
      );
      return null;
    }
  }

  return {
    nodeTemplatesById: workspace.nodeTemplatesById,
    variantKindsById: workspace.variantKindsById,
    templateCategories: workspace.templateCategories,
    rootTemplateOrVariantId: rootDefinition.RootNodeType,
    rootMenuName: rootDefinition.MenuName,
  };
}
