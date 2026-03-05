import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

export type SupportedPatchline = "release" | "pre-release";

export type SchemaDataLocation = {
  rootPath: string;
  source: "companion-export" | "default-data";
};

const DEFAULT_PATCHLINE: SupportedPatchline = "release";
const DEFAULT_SCHEMA_DATA_RELATIVE_PATH = path.join("default-data", "schema-data");
const EXPORT_MANIFEST_FILE_NAME = "export_manifest.json";
const SCHEMA_MAPPINGS_FILE_NAME = "schema_mappings.json";
const SCHEMAS_DIRECTORY_NAME = "schemas";
const INDEXES_DIRECTORY_NAME = "indexes";

export const SUPPORTED_PATCHLINES: SupportedPatchline[] = ["release", "pre-release"];

export function getAssetsZipPath(patchline: string): string {
  return path.join(
    getHytaleHome(),
    "install",
    patchline,
    "package",
    "game",
    "latest",
    "Assets.zip",
  );
}

export function getHytaleHome(): string {
  const home = os.homedir();
  // windows
  if (process.platform === "win32") {
    return path.join(home, "AppData", "Roaming", "Hytale");
  }

  // macos
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Hytale");
  }

  // linux
  return path.join(home, ".local", "share", "Hytale");
}

export function resolvePatchlineFromWorkspace(
  rootPath: string,
  defaultPatchline: SupportedPatchline = DEFAULT_PATCHLINE,
): SupportedPatchline {
  const gradlePropertiesPath = path.join(rootPath, "gradle.properties");
  if (!fs.existsSync(gradlePropertiesPath)) {
    return defaultPatchline;
  }

  const content = fs.readFileSync(gradlePropertiesPath, "utf8");
  const match = content.match(/^\s*patchline\s*=\s*(.+)\s*$/m);
  const patchline = match?.[1]?.trim() as SupportedPatchline | undefined;

  return patchline ?? defaultPatchline;
}

export function resolvePatchlineForContext(context: vscode.ExtensionContext): SupportedPatchline {
  // assumption: user is not developing mod in a multi-root workspace
  // TODO support multi-root workspace
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return DEFAULT_PATCHLINE;
  }
  return resolvePatchlineFromWorkspace(workspaceFolder.uri.fsPath);
}

export function resolveCompanionExportRootFromPatchline(
  globalStoragePath: string,
  patchline: SupportedPatchline,
): string {
  return path.join(globalStoragePath, patchline);
}

export function resolveCompanionExportRoot(context: vscode.ExtensionContext): string {
  return resolveCompanionExportRootFromPatchline(
    context.globalStorageUri.fsPath,
    resolvePatchlineForContext(context),
  );
}

export function resolveExportManifestPathFromPatchline(
  globalStoragePath: string,
  patchline: SupportedPatchline,
): string {
  return path.join(resolveCompanionExportRootFromPatchline(globalStoragePath, patchline), EXPORT_MANIFEST_FILE_NAME);
}

export function resolveDefaultSchemaDataRoot(extensionPath: string): string {
  return path.join(extensionPath, DEFAULT_SCHEMA_DATA_RELATIVE_PATH);
}

export function resolveSchemaDataLocationFromPatchline(
  globalStoragePath: string,
  extensionPath: string,
  patchline: SupportedPatchline,
): SchemaDataLocation {
  const companionExportRoot = resolveCompanionExportRootFromPatchline(globalStoragePath, patchline);
  const exportManifestPath = path.join(companionExportRoot, EXPORT_MANIFEST_FILE_NAME);
  const schemaMappingsPath = path.join(companionExportRoot, SCHEMA_MAPPINGS_FILE_NAME);
  const schemasDirectoryPath = path.join(companionExportRoot, SCHEMAS_DIRECTORY_NAME);
  const indexesDirectoryPath = path.join(companionExportRoot, INDEXES_DIRECTORY_NAME);
  if (
    fs.existsSync(exportManifestPath) &&
    fs.existsSync(schemaMappingsPath) &&
    fs.existsSync(schemasDirectoryPath) &&
    fs.existsSync(indexesDirectoryPath)
  ) {
    return {
      rootPath: companionExportRoot,
      source: "companion-export",
    };
  }

  return {
    rootPath: resolveDefaultSchemaDataRoot(extensionPath),
    source: "default-data",
  };
}

export function resolveSchemaDataLocation(
  context: vscode.ExtensionContext,
  patchline: SupportedPatchline = resolvePatchlineForContext(context),
): SchemaDataLocation {
  return resolveSchemaDataLocationFromPatchline(
    context.globalStorageUri.fsPath,
    context.extensionPath,
    patchline,
  );
}
