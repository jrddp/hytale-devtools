import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { INPUT_HANDLE_ID } from "@shared/node-editor/sharedConstants";
import {
  type FieldComponentType,
  type NodeEditorWorkspace,
  type NodeEditorWorkspaceContext,
  type NodeEditorWorkspaceRootDefinition,
  type NodeField,
  type NodePin,
  type NodeTemplate,
  type VariantKindDefinition,
} from "@shared/node-editor/workspaceTypes";

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

type NodeContentDefinition = {
  Id: string;
  Type: NodeContentDefinitionType;
  Options?: {
    Label?: string;
    Default?: unknown;
    Width?: number;
    Fields?: NodeContentDefinition[];
  };
};

type NodePinDefinition = {
  Id: string;
  Label?: string;
  Color?: string;
  Multiple?: boolean;
  IsMap?: boolean;
};

type NodeSchemaDefinition = Record<
  string,
  | {
      Node?: string;
      node?: string;
      Pin?: string;
      pin?: string;
    }
  | string
>;

type NodeTemplateDefinition = {
  Id: string;
  Title: string;
  Color?: string;
  Content?: NodeContentDefinition[];
  Outputs?: NodePinDefinition[];
  Inputs?: NodePinDefinition[];
  Schema?: NodeSchemaDefinition;
};

type WorkspaceDefinition = {
  WorkspaceName: string;
  Roots?: Record<string, NodeEditorWorkspaceRootDefinition>;
  Variants?: Record<string, VariantKindDefinition>;
  NodeCategories?: Record<string, string[]>;
};

type WorkspacePathRule = {
  workspaceName: string;
  rootId: string;
};

const WORKSPACE_PATH_RULES: Record<string, WorkspacePathRule> = {
  "/Server/ScriptedBrushes/": {
    workspaceName: "Scriptable Brushes",
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
  "/Server/HytaleGenerator/BlockMasks/": {
    workspaceName: "HytaleGenerator (Java)",
    rootId: "BlockMask",
  },
  "/Server/HytaleGenerator/Assignments/": {
    workspaceName: "HytaleGenerator (Java)",
    rootId: "Assignments",
  },
};

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function parseJsonText(text: string): unknown {
  // some workspace json files include UTF-8 BOM
  const normalizedText = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return JSON.parse(normalizedText);
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

function fieldsFromContentDefinitions(content: NodeContentDefinition[] = []): NodeField[] {
  return content.map((entry) => {
    const options = entry.Options ?? {};
    return {
      schemaKey: entry.Id,
      localId: entry.Id,
      type: contentTypeToFieldComponentType(entry.Type),
      label: options.Label,
      value: options.Default,
      inputWidth: options.Width,
      subfields: options.Fields ? fieldsFromContentDefinitions(options.Fields) : undefined,
    };
  });
}

function templateFromDefinition(definition: NodeTemplateDefinition): NodeTemplate {
  const inputPins: NodePin[] =
    definition.Inputs?.map((input, index) => ({
      schemaKey: INPUT_HANDLE_ID + (index === 0 ? "" : index),
      localId: input.Id,
      label: input.Label,
      color: input.Color,
      multiplicity: input.IsMap ? "map" : input.Multiple ? "multiple" : "single",
    })) ?? [];

  const outputPinsByLocalId: Record<string, NodePin> =
    definition.Outputs?.reduce((pinsById, output) => {
      pinsById[output.Id] = {
        schemaKey: "",
        localId: output.Id,
        label: output.Label,
        color: output.Color,
        multiplicity: output.IsMap ? "map" : output.Multiple ? "multiple" : "single",
      };
      return pinsById;
    }, {} as Record<string, NodePin>) ?? {};

  const fieldsByLocalId: Record<string, NodeField> = {};
  for (const field of fieldsFromContentDefinitions(definition.Content ?? [])) {
    fieldsByLocalId[field.localId] = field;
  }

  const fieldsBySchemaKey: Record<string, NodeField> = {};
  const childTypes: Record<string, string> = {};
  const schemaConstants: Record<string, string> = {};

  for (let [schemaKey, schemaEntry] of Object.entries(definition.Schema ?? {})) {
    const postfixLocation = schemaKey.lastIndexOf("$");
    schemaKey = schemaKey.substring(0, postfixLocation > 0 ? postfixLocation : schemaKey.length);

    if (typeof schemaEntry === "string") {
      const field = fieldsByLocalId[schemaEntry];
      if (field) {
        field.schemaKey = schemaKey;
        fieldsBySchemaKey[schemaKey] = field;
      } else {
        schemaConstants[schemaKey] = schemaEntry;
      }
      continue;
    }

    const pinId = schemaEntry.Pin ?? schemaEntry.pin;
    const childTemplateId = schemaEntry.Node ?? schemaEntry.node;
    if (!pinId || !childTemplateId || !outputPinsByLocalId[pinId]) {
      continue;
    }

    outputPinsByLocalId[pinId].schemaKey = schemaKey;
    childTypes[schemaKey] = childTemplateId;
  }

  return {
    templateId: definition.Id,
    defaultTitle: definition.Title,
    childTypes,
    fieldsBySchemaKey,
    inputPins,
    outputPins: Object.values(outputPinsByLocalId),
    schemaConstants,
    nodeColor: definition.Color,
  };
}

async function collectJsonFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const jsonFiles: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      jsonFiles.push(...(await collectJsonFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      jsonFiles.push(fullPath);
    }
  }

  return jsonFiles;
}

function createWorkspaceContext(
  workspace: NodeEditorWorkspace,
  root: NodeEditorWorkspaceRootDefinition,
): NodeEditorWorkspaceContext {
  return {
    rootTemplateOrVariantId: root.RootNodeType,
    rootMenuName: root.MenuName,
    nodeTemplatesById: workspace.nodeTemplatesById,
    variantKindsById: workspace.variantKindsById,
    templateCategories: workspace.templateCategories,
  };
}

export async function loadNodeEditorWorkspacesForTests(
  repoRootPath: string = process.cwd(),
): Promise<Record<string, NodeEditorWorkspace>> {
  const workspacesRootPath = path.join(repoRootPath, "webview", "hytale-node-editor", "Workspaces");
  const workspaceDirectoryEntries = await readdir(workspacesRootPath, { withFileTypes: true });
  const workspacesByName: Record<string, NodeEditorWorkspace> = {};

  for (const workspaceDirectoryEntry of workspaceDirectoryEntries) {
    if (!workspaceDirectoryEntry.isDirectory()) {
      continue;
    }

    const workspaceDirectoryPath = path.join(workspacesRootPath, workspaceDirectoryEntry.name);
    const workspaceDefinitionPath = path.join(workspaceDirectoryPath, "_Workspace.json");

    let workspaceDefinition: WorkspaceDefinition;
    try {
      workspaceDefinition = parseJsonText(await readFile(workspaceDefinitionPath, "utf8")) as WorkspaceDefinition;
    } catch {
      continue;
    }

    const nodeTemplatesById: Record<string, NodeTemplate> = {};
    const templateFilePaths = (await collectJsonFiles(workspaceDirectoryPath)).filter(
      (filePath) => path.basename(filePath) !== "_Workspace.json",
    );

    for (const templateFilePath of templateFilePaths) {
      const templateDefinition = parseJsonText(
        await readFile(templateFilePath, "utf8"),
      ) as NodeTemplateDefinition;
      if (!templateDefinition.Id || !templateDefinition.Title) {
        continue;
      }
      nodeTemplatesById[templateDefinition.Id] = templateFromDefinition(templateDefinition);
    }

    for (const [categoryName, templateIds] of Object.entries(workspaceDefinition.NodeCategories ?? {})) {
      for (const templateId of templateIds) {
        if (nodeTemplatesById[templateId]) {
          nodeTemplatesById[templateId].category = categoryName;
        }
      }
    }

    workspacesByName[workspaceDefinition.WorkspaceName] = {
      workspaceName: workspaceDefinition.WorkspaceName,
      roots: workspaceDefinition.Roots ?? {},
      templateCategories: workspaceDefinition.NodeCategories ?? {},
      nodeTemplatesById,
      variantKindsById: workspaceDefinition.Variants ?? {},
    };
  }

  return workspacesByName;
}

function getWorkspaceContextByMenuName(
  workspacesByName: Record<string, NodeEditorWorkspace>,
  workspaceMenuName: string,
): NodeEditorWorkspaceContext | null {
  for (const workspace of Object.values(workspacesByName)) {
    for (const root of Object.values(workspace.roots)) {
      if (root.MenuName === workspaceMenuName) {
        return createWorkspaceContext(workspace, root);
      }
    }
  }
  return null;
}

function getWorkspaceContextByPathRule(
  assetPath: string,
  workspacesByName: Record<string, NodeEditorWorkspace>,
): NodeEditorWorkspaceContext | null {
  const normalizedAssetPath = normalizePath(assetPath);
  const matchedRulePath = Object.keys(WORKSPACE_PATH_RULES).find((rulePath) =>
    normalizedAssetPath.includes(rulePath),
  );

  if (!matchedRulePath) {
    return null;
  }

  const matchedRule = WORKSPACE_PATH_RULES[matchedRulePath];
  const workspace = workspacesByName[matchedRule.workspaceName];
  const root = workspace?.roots[matchedRule.rootId];
  if (!workspace || !root) {
    return null;
  }

  return createWorkspaceContext(workspace, root);
}

function getWorkspaceFallbackContext(
  assetPath: string,
  workspacesByName: Record<string, NodeEditorWorkspace>,
): NodeEditorWorkspaceContext | null {
  const normalizedAssetPath = normalizePath(assetPath);

  if (normalizedAssetPath.includes("/Server/ScriptedBrushes/")) {
    const workspace = workspacesByName["Scriptable Brushes"];
    const root = workspace?.roots.DropList;
    if (workspace && root) {
      return createWorkspaceContext(workspace, root);
    }
  }

  if (normalizedAssetPath.includes("/Server/HytaleGenerator/")) {
    const workspace = workspacesByName["HytaleGenerator (Java)"];
    const root = workspace?.roots.Biome;
    if (workspace && root) {
      return createWorkspaceContext(workspace, root);
    }
  }

  return null;
}

export function resolveWorkspaceContextForAssetPath(
  assetPath: string,
  workspacesByName: Record<string, NodeEditorWorkspace>,
  parsedAssetJson?: Record<string, unknown>,
): NodeEditorWorkspaceContext | null {
  const nodeEditorMetadata = parsedAssetJson?.$NodeEditorMetadata as
    | Record<string, unknown>
    | undefined;
  const workspaceMenuName = nodeEditorMetadata?.$WorkspaceID ?? parsedAssetJson?.$WorkspaceID;
  if (typeof workspaceMenuName === "string" && workspaceMenuName.length > 0) {
    const menuResolvedContext = getWorkspaceContextByMenuName(workspacesByName, workspaceMenuName);
    if (menuResolvedContext) {
      return menuResolvedContext;
    }
  }

  const pathResolvedContext = getWorkspaceContextByPathRule(assetPath, workspacesByName);
  if (pathResolvedContext) {
    return pathResolvedContext;
  }

  return getWorkspaceFallbackContext(assetPath, workspacesByName);
}

export async function loadHytaleGeneratorBiomeWorkspaceContext(
  repoRootPath: string = process.cwd(),
): Promise<NodeEditorWorkspaceContext> {
  const workspacesByName = await loadNodeEditorWorkspacesForTests(repoRootPath);
  const workspace = workspacesByName["HytaleGenerator (Java)"];
  const biomeRoot = workspace?.roots.Biome;
  if (!workspace || !biomeRoot) {
    throw new Error("Biome root definition not found in HytaleGenerator Java _Workspace.json");
  }

  return createWorkspaceContext(workspace, biomeRoot);
}
