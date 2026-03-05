import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const suppressedViteMessageSnippets = ["[vite-plugin-svelte]", "The build was canceled"];

function shouldSuppressViteNoise(args) {
  const message = args.map((value) => String(value)).join(" ");
  return suppressedViteMessageSnippets.some((snippet) => message.includes(snippet));
}

async function withSuppressedViteNoise(work) {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  const makeFilteredLogger = (original) => {
    return (...args) => {
      if (shouldSuppressViteNoise(args)) {
        return;
      }
      original(...args);
    };
  };

  console.log = makeFilteredLogger(originalLog);
  console.warn = makeFilteredLogger(originalWarn);
  console.error = makeFilteredLogger(originalError);
  process.stderr.write = ((chunk, encoding, callback) => {
    const message =
      typeof chunk === "string"
        ? chunk
        : chunk.toString(typeof encoding === "string" ? encoding : "utf8");
    if (shouldSuppressViteNoise([message])) {
      if (typeof callback === "function") {
        callback();
      }
      return true;
    }
    return originalStderrWrite(chunk, encoding, callback);
  });

  return await work();
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function fieldsFromContentDefinitions(content) {
  if (!Array.isArray(content)) {
    return [];
  }
  return content
    .filter(isObject)
    .map((entry) => {
      const options = isObject(entry.Options) ? entry.Options : undefined;
      return {
        schemaKey: entry.Id,
        localId: entry.Id,
        type: contentTypeToFieldComponentType(entry.Type),
        label: options?.Label,
        value: options?.Default,
        inputWidth: options?.Width,
        subfields: fieldsFromContentDefinitions(options?.Fields),
      };
    });
}

function stripSchemaKeyPostfix(schemaKey) {
  const postfixLocation = schemaKey.lastIndexOf("$");
  return schemaKey.substring(0, postfixLocation > 0 ? postfixLocation : schemaKey.length);
}

function templateFromDefinition(definition) {
  const inputPins = Array.isArray(definition.Inputs)
    ? definition.Inputs.map((input, idx) => ({
        schemaKey: `input${idx === 0 ? "" : idx}`,
        localId: input.Id,
        label: input.Label,
        color: input.Color,
        multiplicity: input.IsMap ? "map" : input.Multiple ? "multiple" : "single",
      }))
    : [];

  const outputPinsByLocalId = {};
  if (Array.isArray(definition.Outputs)) {
    for (const output of definition.Outputs) {
      if (!isObject(output) || !output.Id) {
        continue;
      }
      outputPinsByLocalId[output.Id] = {
        schemaKey: "",
        localId: output.Id,
        label: output.Label,
        color: output.Color,
        multiplicity: output.IsMap ? "map" : output.Multiple ? "multiple" : "single",
      };
    }
  }

  const fieldsByLocalId = {};
  for (const field of fieldsFromContentDefinitions(definition.Content)) {
    fieldsByLocalId[field.localId] = field;
  }

  const fieldsBySchemaKey = {};
  const childTypes = {};
  const schemaConstants = {};

  for (const [rawSchemaKey, entry] of Object.entries(definition.Schema ?? {})) {
    const schemaKey = stripSchemaKeyPostfix(rawSchemaKey);
    if (typeof entry === "string") {
      const field = fieldsByLocalId[entry];
      if (field) {
        field.schemaKey = schemaKey;
        fieldsBySchemaKey[schemaKey] = field;
      } else {
        schemaConstants[schemaKey] = entry;
      }
      continue;
    }

    if (!isObject(entry)) {
      continue;
    }

    const pin = entry.Pin ?? entry.pin;
    const node = entry.Node ?? entry.node;
    if (!pin || !node || !outputPinsByLocalId[pin]) {
      continue;
    }

    outputPinsByLocalId[pin].schemaKey = schemaKey;
    childTypes[schemaKey] = node;
  }

  return {
    templateId: definition.Id,
    defaultTitle: definition.Title,
    childTypes,
    fieldsBySchemaKey,
    inputPins,
    outputPins: Object.values(outputPinsByLocalId),
    schemaConstants,
  };
}

async function collectJsonFilesRecursively(directory) {
  const filePaths = [];
  const directoryEntries = await readdir(directory, { withFileTypes: true });
  for (const entry of directoryEntries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      filePaths.push(...(await collectJsonFilesRecursively(entryPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      filePaths.push(entryPath);
    }
  }
  return filePaths;
}

async function generateBiomeWorkspaceContext() {
  const workspaceDirectory = path.join(
    repoRoot,
    "webview",
    "hytale-node-editor",
    "Workspaces",
    "HytaleGenerator Java",
  );
  const workspaceDefinitionPath = path.join(workspaceDirectory, "_Workspace.json");
  const workspaceDefinition = JSON.parse(await readFile(workspaceDefinitionPath, "utf8"));

  const templateFilePaths = (await collectJsonFilesRecursively(workspaceDirectory)).filter(
    (filePath) => path.basename(filePath) !== "_Workspace.json",
  );

  const nodeTemplatesById = {};
  for (const filePath of templateFilePaths) {
    const definition = JSON.parse(await readFile(filePath, "utf8"));
    if (!isObject(definition) || !definition.Id || !definition.Title) {
      continue;
    }
    const template = templateFromDefinition(definition);
    nodeTemplatesById[template.templateId] = template;
  }

  for (const [category, templateIds] of Object.entries(workspaceDefinition.NodeCategories ?? {})) {
    if (!Array.isArray(templateIds)) {
      continue;
    }
    for (const templateId of templateIds) {
      if (nodeTemplatesById[templateId]) {
        nodeTemplatesById[templateId].category = category;
      }
    }
  }

  const rootDefinition = workspaceDefinition?.Roots?.Biome;
  if (!rootDefinition) {
    throw new Error("Could not resolve Biome root definition from HytaleGenerator workspace.");
  }

  return {
    rootTemplateOrVariantId: rootDefinition.RootNodeType,
    rootMenuName: rootDefinition.MenuName,
    nodeTemplatesById,
    variantKindsById: workspaceDefinition.Variants ?? {},
    templateCategories: workspaceDefinition.NodeCategories ?? {},
  };
}

async function main() {
  await withSuppressedViteNoise(async () => {
    const viteServer = await createServer({
      configFile: path.join(repoRoot, "webview", "hytale-node-editor", "vite.config.mjs"),
      server: {
        middlewareMode: true,
      },
      appType: "custom",
      logLevel: "silent",
    });

    const { parseDocumentText } = await viteServer.ssrLoadModule(
      "/src/node-editor/parsing/parseDocument.svelte.ts",
    );
    const workspaceContext = await generateBiomeWorkspaceContext();
    const basicPath = path.join(repoRoot, "Ref", "SampleJson", "Basic.json");
    const basicJsonText = await readFile(basicPath, "utf8");

    const parsed = parseDocumentText(basicJsonText, workspaceContext);

    console.log("parseDocumentText succeeded.");
    console.log(`rootNodeId: ${parsed.rootNodeId}`);
    console.log(`nodes: ${parsed.nodes.length}`);
    console.log(`edges: ${parsed.edges.length}`);
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
