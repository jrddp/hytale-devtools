import { existsSync, readdirSync, statSync } from "fs";
import path, { join } from "path";
import { type SchemaRuntime } from "../schema/schemaLoader";
import { type BasicLogger } from "../shared/commonTypes";
import { safeParseJSONFile } from "../shared/fileUtils";
import { type AssetDocumentShape } from "../shared/node-editor/assetTypes";
import { INPUT_HANDLE_ID } from "../shared/node-editor/sharedConstants";
import {
  type FieldComponentType,
  type NodeEditorWorkspace,
  type NodeEditorWorkspaceContext,
  type NodeEditorWorkspaceRootDefinition,
  type NodeField,
  type NodePin,
  type NodeTemplate,
} from "../shared/node-editor/workspaceTypes";
import { isObject } from "../shared/typeUtils";
import {
  type NodeContentDefinition,
  type NodeContentDefinitionType,
  type NodeEditorWorkspaceDefinition,
  type NodeTemplateDefinition,
  type NodeTemplateSupplementDefinition,
  type WorkspacePathRule,
} from "./workspaceDefinitionTypes";

export const NODE_EDITOR_WORKSPACE_PATH_RULES: Record<string, WorkspacePathRule> = {
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
  "/Server/HytaleGenerator/Assignments/": {
    workspaceName: "HytaleGenerator (Java)",
    rootId: "Assignments",
  },
};

export function getNodeEditorWorkspaceSupplementsRootPath(workspacesRootPath: string): string {
  return join(path.dirname(workspacesRootPath), "data-supplements", "node-editor-workspaces");
}

export function getNodeEditorWorkspaceSupplementPath(
  supplementsRootPath: string,
  workspaceDirectoryName: string,
): string {
  return join(supplementsRootPath, `${workspaceDirectoryName}.json`);
}

export class WorkspaceRuntime {
  readonly nodeEditorWorkspaces: Record<string, NodeEditorWorkspace>;
  readonly workspacesRootPath: string;
  readonly supplementsRootPath: string;
  private readonly schemaRuntime: SchemaRuntime;
  private readonly logger: BasicLogger;

  constructor(
    workspacesRootPath: string,
    schemaRuntime: SchemaRuntime,
    logger: BasicLogger = console,
    supplementsRootPath: string = getNodeEditorWorkspaceSupplementsRootPath(workspacesRootPath),
  ) {
    this.workspacesRootPath = workspacesRootPath;
    this.supplementsRootPath = supplementsRootPath;
    this.schemaRuntime = schemaRuntime;
    this.logger = logger;
    this.nodeEditorWorkspaces = this.loadNodeEditorWorkspaces();
  }

  resolveWorkspaceContext(assetPath: string): NodeEditorWorkspaceContext | null {
    assetPath = path.normalize(assetPath);
    const subpathMatch = Object.keys(NODE_EDITOR_WORKSPACE_PATH_RULES).find(subpath =>
      assetPath.includes(subpath),
    );
    if (!subpathMatch) {
      return null;
    }

    const fileParse = safeParseJSONFile(assetPath) as AssetDocumentShape | undefined;
    // ! $WorkspaceID actually saves the root menuname. e.g. "HytaleGenerator - Biome". This is the base-game node editor behavior.
    const parsedMenuName: string | undefined = fileParse?.$NodeEditorMetadata?.$WorkspaceID;
    let workspace: NodeEditorWorkspace | undefined;
    let rootDefinition: NodeEditorWorkspaceRootDefinition | undefined;
    // match root/workspace by menu name. could be optimized but real world size would never be very large
    if (parsedMenuName) {
      let found = false;
      for (const currentWorkspace of Object.values(this.nodeEditorWorkspaces)) {
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
      const matchedRule = NODE_EDITOR_WORKSPACE_PATH_RULES[subpathMatch];
      workspace = this.nodeEditorWorkspaces[matchedRule.workspaceName];
      if (!workspace) {
        return null;
      }
      rootDefinition = workspace.roots[matchedRule.rootId];
      if (!rootDefinition) {
        this.logger.warn(
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

  private loadNodeEditorWorkspaces(): Record<string, NodeEditorWorkspace> {
    const workspaces: Record<string, NodeEditorWorkspace> = {};

    for (const directory of readdirSync(this.workspacesRootPath)) {
      const directoryPath = join(this.workspacesRootPath, directory);
      if (!statSync(directoryPath).isDirectory()) {
        continue;
      }

      const _workspace = join(directoryPath, "_Workspace.json");
      if (!existsSync(_workspace)) {
        this.logger.warn(
          `Workspace template directory "${directoryPath}" is missing _Workspace.json file. Skipping.`,
        );
        continue;
      }
      const workspaceDefinition = safeParseJSONFile(_workspace) as NodeEditorWorkspaceDefinition;
      const templateSupplements = this.loadTemplateSupplements(directory);

      const templatesById: Record<string, NodeTemplate> = {};
      this.loadTemplatesFromDirectory(directoryPath, templateSupplements, templatesById);

      for (const [category, templateList] of Object.entries(
        workspaceDefinition.NodeCategories ?? {},
      )) {
        for (const templateId of templateList) {
          if (!templatesById[templateId]) {
            this.logger.warn(
              `Template "${templateId}" of category ${category} is missing from workspace "${workspaceDefinition.WorkspaceName}".`,
            );
            continue;
          }
          templatesById[templateId].category = category;
        }
      }

      // Use the workspace variant mapping as the source of truth for variant selector constants.
      // Some template-local schema constants don't match the actual serialized asset token.
      for (const variantKind of Object.values(workspaceDefinition.Variants ?? {})) {
        for (const [variantValue, templateId] of Object.entries(variantKind.Variants ?? {})) {
          const template = templatesById[templateId];
          if (!template) {
            continue;
          }

          template.schemaConstants[variantKind.VariantFieldName] = variantValue;
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

  private loadTemplatesFromDirectory(
    directoryPath: string,
    templateSupplements: Record<string, NodeTemplateSupplementDefinition>,
    templatesById: Record<string, NodeTemplate>,
  ): void {
    for (const file of readdirSync(directoryPath)) {
      if (file === "_Workspace.json" || file === "__SchemaMappings.json") {
        continue;
      }

      const filePath = join(directoryPath, file);

      if (statSync(filePath).isDirectory()) {
        this.loadTemplatesFromDirectory(filePath, templateSupplements, templatesById);
      } else {
        const templateDefinition = safeParseJSONFile(filePath) as NodeTemplateDefinition;
        const templateSupplement = templateSupplements[templateDefinition.Id];
        const schemaMapping =
          typeof templateSupplement?.$ref === "string" ? templateSupplement.$ref : undefined;
        const template = this.templateFromDefinition(
          templateDefinition,
          schemaMapping,
          templateSupplement,
        );
        templatesById[template.templateId] = template;
      }
    }
  }

  private loadTemplateSupplements(
    workspaceDirectoryName: string,
  ): Record<string, NodeTemplateSupplementDefinition> {
    const supplementsPath = getNodeEditorWorkspaceSupplementPath(
      this.supplementsRootPath,
      workspaceDirectoryName,
    );
    if (!existsSync(supplementsPath)) {
      return {};
    }

    const parsed = safeParseJSONFile(supplementsPath);
    if (!isObject(parsed)) {
      this.logger.warn(`Template supplements at "${supplementsPath}" are not an object. Ignoring.`);
      return {};
    }

    return parsed as Record<string, NodeTemplateSupplementDefinition>;
  }

  private findSchemaKeyForLocalId(
    schema: NodeTemplateDefinition["Schema"],
    localId: string,
  ): string | undefined {
    for (let [schemaKey, entry] of Object.entries(schema ?? {})) {
      const postFixLoc = schemaKey.lastIndexOf("$");
      schemaKey = schemaKey.substring(0, postFixLoc > 0 ? postFixLoc : schemaKey.length);
      if (entry === localId) {
        return schemaKey;
      }
      if (isObject(entry) && entry.Pin === localId) {
        return schemaKey;
      }
    }

    return undefined;
  }

  // from exact json definition to optimized usage structure
  private templateFromDefinition(
    definition: NodeTemplateDefinition,
    schemaRef?: string,
    supplement?: NodeTemplateSupplementDefinition,
  ): NodeTemplate {
    const assetFieldDefinition = schemaRef
      ? this.schemaRuntime.resolveFieldByReferencePointer(schemaRef)
      : undefined;
    const assetObjectFieldDefinition =
      assetFieldDefinition?.type === "object" ? assetFieldDefinition : undefined;
    if (
      schemaRef &&
      assetFieldDefinition &&
      assetFieldDefinition.type !== "object" &&
      assetFieldDefinition.type !== "variant"
    ) {
      this.logger.warn(
        `Schema reference ${schemaRef} not resolved to an object field or variant field in template ${definition.Id}.`,
      );
    }
    if (schemaRef && !assetFieldDefinition) {
      this.logger.warn(`Schema reference ${schemaRef} not resolved in template ${definition.Id}.`);
    }

    const supplementedContentDescriptions = this.descriptionByLocalId(supplement?.Content);
    const supplementedOutputDescriptions = this.descriptionByLocalId(supplement?.Outputs);

    const inputPins: NodePin[] =
      definition.Inputs?.map((input, idx) => {
        return {
          schemaKey: INPUT_HANDLE_ID + (idx === 0 ? "" : idx),
          localId: input.Id,
          label: input.Label,
          description:
            input.Description ??
            assetObjectFieldDefinition?.properties[
              this.findSchemaKeyForLocalId(definition.Schema, input.Id) ?? ""
            ]?.markdownDescription,
          color: input.Color,
          multiplicity: input.IsMap ? "map" : input.Multiple ? "multiple" : "single",
        };
      }) ?? [];

    const fieldsByLocalId: Record<string, NodeField> = {};

    const outputPinsByLocalId =
      definition.Outputs?.reduce(
        (map, output) => {
          const type = output.IsMap ? "map" : output.Multiple ? "multiple" : "single";
          const fields = output.Fields
            ? this.fieldsFromContentDefinitions(output.Fields)
            : undefined;
          if (fields) {
            for (const field of fields) {
              fieldsByLocalId[field.localId] = field;
            }
          }
          map[output.Id] = {
            schemaKey: "",
            localId: output.Id,
            label: output.Label,
            description: supplementedOutputDescriptions[output.Id] ?? output.Description,
            color: output.Color,
            multiplicity: type,
            fields,
          };
          return map;
        },
        {} as Record<string, NodePin>,
      ) ?? {};

    for (const field of this.fieldsFromContentDefinitions(
      definition.Content ?? [],
      supplementedContentDescriptions,
    )) {
      fieldsByLocalId[field.localId] = field;
    }

    const fieldsBySchemaKey: Record<string, NodeField> = {};
    const childTypes: Record<string, string> = {};
    const schemaConstants: Record<string, string> = {};

    for (let [schemaKey, entry] of Object.entries(definition.Schema ?? {})) {
      // strip postfix e.g. "$Pin" from schema key (see Root.json in ScriptableBrushes workspace)
      const postFixLoc = schemaKey.lastIndexOf("$");
      schemaKey = schemaKey.substring(0, postFixLoc > 0 ? postFixLoc : schemaKey.length);
      if (typeof entry === "string") {
        if (fieldsByLocalId?.[entry]) {
          // entry is local contentId
          fieldsByLocalId[entry].schemaKey = schemaKey;
          fieldsBySchemaKey[schemaKey] = fieldsByLocalId[entry];
          const nodeField = fieldsBySchemaKey[schemaKey];

          // hydrate with schema-sourced data
          const schemaField = assetObjectFieldDefinition?.properties[schemaKey];
          if (schemaField?.type === "string") {
            nodeField.symbolLookup = schemaField.symbolRef;
          }
          if (schemaField?.type === "color") {
            nodeField.type = "color";
          }
          nodeField.description = nodeField.description ?? schemaField?.markdownDescription;
        } else {
          // entry is a constant
          schemaConstants[schemaKey] = entry;
        }
      } else {
        // entry defines pin information
        const pinId = entry.Pin ?? entry.pin;
        const variantOrTemplateId = entry.Node ?? entry.node;
        if (!pinId || !variantOrTemplateId) {
          this.logger.error(
            `Pin and node expected but not parsed for schema key ${schemaKey} of template ${definition.Id}`,
          );
          continue;
        }
        const outputPin = outputPinsByLocalId[pinId];
        if (!outputPin) {
          this.logger.error(
            `Pin ${pinId} not resolved to local id for schema key ${schemaKey} of template ${definition.Id}`,
          );
          continue;
        }

        outputPin.schemaKey = schemaKey;

        const schemaField = assetObjectFieldDefinition?.properties[schemaKey];
        outputPin.description = outputPin.description ?? schemaField?.markdownDescription;
        childTypes[schemaKey] = variantOrTemplateId;
      }
    }

    return {
      templateId: definition.Id,
      defaultTitle: definition.Title,
      description:
        supplement?.Description ?? definition.Description ?? assetFieldDefinition?.markdownDescription,
      childTypes: childTypes,
      fieldsBySchemaKey: fieldsBySchemaKey,
      inputPins: inputPins,
      outputPins: Object.values(outputPinsByLocalId),
      schemaConstants: schemaConstants,
      nodeColor: definition.Color,
    };
  }

  private descriptionByLocalId(
    definitions: { Id: string; Description?: string }[] | undefined,
  ): Record<string, string> {
    return (
      definitions?.reduce(
        (map, definition) => {
          if (definition.Description) {
            map[definition.Id] = definition.Description;
          }
          return map;
        },
        {} as Record<string, string>,
      ) ?? {}
    );
  }

  private fieldsFromContentDefinitions(
    content: NodeContentDefinition[],
    supplementedDescriptionsByLocalId: Record<string, string> = {},
  ): NodeField[] {
    return content.map(content => {
      const overrideAutocompleteValues = Array.isArray(content.Options?.Values)
        ? content.Options.Values.filter((value): value is string => typeof value === "string")
        : undefined;

      return {
        schemaKey: content.Id,
        localId: content.Id,
        type: this.contentTypeToFieldComponentType(content.Type),
        label: content.Options?.Label,
        description:
          supplementedDescriptionsByLocalId[content.Id] ??
          content.Description ??
          content.Options.Description,
        value: content.Options?.Default ?? content.Options?.DefaultValue,
        isImplicit: true,
        inputWidth: content.Options?.Width,
        overrideAutocompleteValues,
        subfields: content.Options?.Fields
          ? this.fieldsFromContentDefinitions(content.Options.Fields)
          : undefined,
      };
    });
  }

  private contentTypeToFieldComponentType(type: NodeContentDefinitionType): FieldComponentType {
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
        this.logger.warn(`Unknown node template content type: ${type}. Defaulting to string.`);
        return "string";
    }
  }
}
