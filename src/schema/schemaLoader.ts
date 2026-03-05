import { readdirSync } from "fs";
import path, { normalize } from "path";
import type * as vscode from "vscode";
import { schemaMappings } from "../extension";
import { safeParseJSONFile } from "../shared/fileUtils";
import { type SchemaMappings } from "../shared/schema/types";
import { resolveSchemaDataLocation } from "../utils/hytalePaths";
import { type SchemaDocs } from "./schemaPointerResolver";

export const DIALECT_URI = "http://json-schema.org/draft-07/schema";
export const SCHEMA_REGISTRY_BASE_URI = "https://hytale.local/schemas/";

export function loadSchemaMappings(context: vscode.ExtensionContext): SchemaMappings {
  return loadSchemaMappingsFromRoot(resolveSchemaDataLocation(context).rootPath);
}

export function loadSchemaDefinitions(context: vscode.ExtensionContext): SchemaDocs {
  return loadSchemaDefinitionsFromRoot(resolveSchemaDataLocation(context).rootPath);
}

export function loadSchemaMappingsFromRoot(rootPath: string): SchemaMappings {
  return safeParseJSONFile(path.join(rootPath, "schema_mappings.json")) as SchemaMappings;
}

export function loadSchemaDefinitionsFromRoot(rootPath: string): SchemaDocs {
  const docs: SchemaDocs = {};
  const schemaDir = path.join(rootPath, "schemas");

  for (const file of readdirSync(schemaDir)) {
    const schemaPath = path.join(schemaDir, file);
    const schema = safeParseJSONFile(schemaPath);
    docs[file] = schema;
  }

  return docs;
}

export function getSchemaForPath(assetPath: string): string | undefined {
  const normalizedPath = normalize(assetPath);
  for (const mapping of schemaMappings.schemaMappings["json.schemas"]) {
    for (const pattern of mapping.fileMatch) {
      if (path.matchesGlob(normalizedPath, `**/${pattern}`)) {
        return `${SCHEMA_REGISTRY_BASE_URI}${mapping.url.split("/").pop()}`;
      }
    }
  }
  return undefined;
}
