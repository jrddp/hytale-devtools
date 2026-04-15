import path from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const descriptorPath = path.resolve(currentDir, "../../default-data/export-data/npc_descriptors.json");
const npcBehaviorWorkspacePath = path.resolve(
  currentDir,
  "../../default-data/node-editor-workspace-definitions/NPCBehavior",
);
const devBootstrapRoute = "/__npc-role-editor/dev-bootstrap";
const devDocumentCandidatePaths = [
  "/Users/jard/Downloads/NPCTesting/src/main/resources/Server/NPC/Roles/_Core/Templates/Template_Livestock.json",
  "/Users/jard/Code/vscode-extensions/hytale-devtools/Reference/BaseGameAssets/Server/NPC/Roles/_Core/Tests/Interaction/Test_Interaction.json",
];
const fallbackDocumentPath = "/tmp/Server/NPC/Roles/_Core/Tests/Interaction/Test_Interaction.json";
const fallbackDocumentData = {
  Type: "Generic",
  StartState: "Idle",
  Appearance: "Kweebec_Sapling_Orange",
  Debug: "DisplayState",
  InteractionInstruction: {
    Instructions: [
      {
        Sensor: {
          Type: "Not",
          Sensor: {
            Type: "CanInteract",
            ViewSector: 90,
          },
        },
        Actions: [
          {
            Type: "SetInteractable",
            Interactable: false,
          },
        ],
      },
      {
        Continue: true,
        Sensor: {
          Type: "Any",
        },
        Actions: [
          {
            Type: "SetInteractable",
            Interactable: true,
          },
        ],
      },
    ],
  },
};

function jsonResponse(body) {
  return JSON.stringify(body);
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function resolveDevDocument() {
  const resolvedPath = devDocumentCandidatePaths.find(candidate => existsSync(candidate));
  if (resolvedPath) {
    return {
      documentPath: resolvedPath,
      text: readFileSync(resolvedPath, "utf8"),
    };
  }

  return {
    documentPath: fallbackDocumentPath,
    text: JSON.stringify(fallbackDocumentData, null, 2),
  };
}

function contentTypeToFieldComponentType(type) {
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

function fieldsFromContentDefinitions(content = []) {
  return content.map(contentDefinition => {
    const overrideAutocompleteValues = Array.isArray(contentDefinition.Options?.Values)
      ? contentDefinition.Options.Values.filter(value => typeof value === "string")
      : undefined;

    return {
      schemaKey: contentDefinition.Id,
      localId: contentDefinition.Id,
      type: contentTypeToFieldComponentType(contentDefinition.Type),
      label: contentDefinition.Options?.Label,
      description: contentDefinition.Description ?? contentDefinition.Options?.Description,
      value: contentDefinition.Options?.Default ?? contentDefinition.Options?.DefaultValue,
      isImplicit: true,
      inputWidth: contentDefinition.Options?.Width,
      overrideAutocompleteValues,
      subfields: contentDefinition.Options?.Fields
        ? fieldsFromContentDefinitions(contentDefinition.Options.Fields)
        : undefined,
    };
  });
}

function templateFromDefinition(definition) {
  const inputPins =
    definition.Inputs?.map((input, idx) => ({
      schemaKey: `Input${idx === 0 ? "" : idx}`,
      localId: input.Id,
      connectionType: input.Type,
      label: input.Label,
      description: input.Description,
      color: input.Color,
      multiplicity: input.IsMap ? "map" : input.Multiple ? "multiple" : "single",
    })) ?? [];

  const fieldsByLocalId = {};

  const outputPinsByLocalId =
    definition.Outputs?.reduce((map, output) => {
      const fields = output.Fields ? fieldsFromContentDefinitions(output.Fields) : undefined;
      if (fields) {
        for (const field of fields) {
          fieldsByLocalId[field.localId] = field;
        }
      }

      map[output.Id] = {
        schemaKey: "",
        localId: output.Id,
        connectionType: output.Type,
        label: output.Label,
        description: output.Description,
        color: output.Color,
        multiplicity: output.IsMap ? "map" : output.Multiple ? "multiple" : "single",
        fields,
      };
      return map;
    }, {}) ?? {};

  for (const field of fieldsFromContentDefinitions(definition.Content ?? [])) {
    fieldsByLocalId[field.localId] = field;
  }

  const fieldsBySchemaKey = {};
  const childTypes = {};
  const schemaConstants = {};

  for (let [schemaKey, entry] of Object.entries(definition.Schema ?? {})) {
    const postFixLoc = schemaKey.lastIndexOf("$");
    schemaKey = schemaKey.substring(0, postFixLoc > 0 ? postFixLoc : schemaKey.length);

    if (typeof entry === "string") {
      if (fieldsByLocalId[entry]) {
        fieldsByLocalId[entry].schemaKey = schemaKey;
        fieldsBySchemaKey[schemaKey] = fieldsByLocalId[entry];
      } else {
        schemaConstants[schemaKey] = entry;
      }
      continue;
    }

    const pinId = entry?.Pin ?? entry?.pin;
    const variantOrTemplateId = entry?.Node ?? entry?.node;
    if (!pinId || !variantOrTemplateId) {
      continue;
    }

    const outputPin = outputPinsByLocalId[pinId];
    if (!outputPin) {
      continue;
    }

    outputPin.schemaKey = schemaKey;
    childTypes[schemaKey] = variantOrTemplateId;
  }

  return {
    templateId: definition.Id,
    defaultTitle: definition.Title,
    description: definition.Description,
    category: undefined,
    childTypes,
    fieldsBySchemaKey,
    inputPins,
    outputPins: Object.values(outputPinsByLocalId),
    schemaConstants,
    nodeColor: definition.Color,
  };
}

function loadTemplatesFromDirectory(directoryPath, templatesById) {
  for (const file of readdirSync(directoryPath)) {
    if (file === "_Workspace.json" || file === "__SchemaMappings.json") {
      continue;
    }

    const filePath = path.join(directoryPath, file);
    const stats = statSync(filePath);
    if (stats.isDirectory()) {
      loadTemplatesFromDirectory(filePath, templatesById);
      continue;
    }

    const templateDefinition = readJsonFile(filePath);
    templatesById[templateDefinition.Id] = templateFromDefinition(templateDefinition);
  }
}

function buildNpcBehaviorGraphContexts() {
  const workspaceDefinitionPath = path.join(npcBehaviorWorkspacePath, "_Workspace.json");
  const workspaceDefinition = readJsonFile(workspaceDefinitionPath);
  const templatesById = {};

  loadTemplatesFromDirectory(npcBehaviorWorkspacePath, templatesById);

  for (const [category, templateIds] of Object.entries(workspaceDefinition.NodeCategories ?? {})) {
    for (const templateId of templateIds) {
      if (templatesById[templateId]) {
        templatesById[templateId].category = category;
      }
    }
  }

  for (const variantKind of Object.values(workspaceDefinition.Variants ?? {})) {
    for (const [variantValue, templateId] of Object.entries(variantKind.Variants ?? {})) {
      if (templatesById[templateId]) {
        templatesById[templateId].schemaConstants[variantKind.VariantFieldName] = variantValue;
      }
    }
  }

  const createContext = rootId => {
    const root = workspaceDefinition.Roots?.[rootId];
    if (!root) {
      return undefined;
    }

    return {
      nodeTemplatesById: templatesById,
      variantKindsById: workspaceDefinition.Variants ?? {},
      templateCategories: workspaceDefinition.NodeCategories ?? {},
      rootTemplateOrVariantId: root.RootNodeType,
      rootMenuName: root.MenuName,
    };
  };

  return {
    Instructions: createContext("Instructions"),
    Instruction: createContext("Instruction"),
    Sensor: createContext("Sensor"),
  };
}

function getDevBootstrapPayload() {
  const descriptors = JSON.parse(readFileSync(descriptorPath, "utf8"));
  const devDocument = resolveDevDocument();
  return {
    descriptors,
    descriptorPath,
    descriptorSource: "default-data",
    nodeEditorControlScheme: "mouse",
    nodeEditorPlatform: "win",
    nodeEditorClipboard: { nodes: [], edges: [] },
    npcBehaviorGraphContexts: buildNpcBehaviorGraphContexts(),
    documentPath: devDocument.documentPath,
    text: devDocument.text,
    version: 1,
  };
}

function npcRoleEditorDevPlugin() {
  return {
    name: "npc-role-editor-dev-plugin",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        try {
          const requestUrl = new URL(req.url ?? "/", "http://localhost");
          if (requestUrl.pathname === devBootstrapRoute) {
            res.setHeader("Content-Type", "application/json");
            res.end(jsonResponse(getDevBootstrapPayload()));
            return;
          }
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            jsonResponse({
              error: error instanceof Error ? error.message : String(error),
            }),
          );
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  root: currentDir,
  base: "./",
  resolve: {
    alias: {
      "@shared": path.resolve(currentDir, "../../src/shared"),
      "@webview-shared": path.resolve(currentDir, "../shared"),
      "@node-editor": path.resolve(currentDir, "../hytale-node-editor/src"),
      src: path.resolve(currentDir, "src"),
    },
  },
  plugins: [svelte(), tailwindcss(), npcRoleEditorDevPlugin()],
  build: {
    outDir: path.resolve(currentDir, "../../media/hytaleNpcRoleEditor"),
    emptyOutDir: true,
    manifest: true,
    sourcemap: "inline",
    rollupOptions: {
      output: {
        entryFileNames: "main.js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
