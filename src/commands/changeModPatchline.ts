import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { getHytaleHome, resolvePatchlineFromWorkspace } from "../utils/hytalePaths";
import { safeParseJSONFile } from "../shared/fileUtils";
import { isObject } from "../shared/typeUtils";

const SUPPORTED_PATCHLINES = ["release", "pre-release"] as const;
type SupportedPatchline = (typeof SUPPORTED_PATCHLINES)[number];

const GRADLE_PROPERTIES_RELATIVE_PATH = "gradle.properties";
const LAUNCH_CONFIG_RELATIVE_PATH = path.join(".vscode", "launch.json");
const COMPANION_CONFIG_RELATIVE_PATH = path.join(
  "run",
  "mods",
  "kokeria_HytaleDevtoolsCompanion",
  "config.json",
);
const LEGACY_COMPANION_CONFIG_RELATIVE_PATH = path.join(
  "run",
  "plugins",
  "HytaleDevtoolsCompanion",
  "config.json",
);
const COMPANION_MOD_LIBS_RELATIVE_PATH = path.join("companion-mod", "build", "libs");
const HYTALE_SERVER_MAIN_CLASS = "com.hypixel.hytale.Main";

interface LaunchConfigurationDocument {
  configurations?: unknown;
  [key: string]: unknown;
}

interface LaunchConfigurationEntry {
  args?: unknown;
  [key: string]: unknown;
}

export async function changeModPatchline(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("No workspace open");
    return;
  }

  const workspaceRootPath = workspaceFolders[0].uri.fsPath;
  if (!detectHytaleModWorkspace(workspaceRootPath)) {
    vscode.window.showErrorMessage("This workspace does not look like a Hytale mod project.");
    return;
  }

  const currentPatchline = toSupportedPatchline(resolvePatchlineFromWorkspace(workspaceRootPath));
  const selectedPatchline = await pickPatchline(currentPatchline);
  if (!selectedPatchline) {
    return;
  }

  const serverJarPath = getServerJarPath(selectedPatchline);
  if (!fs.existsSync(serverJarPath)) {
    vscode.window.showErrorMessage(
      `Hytale Server installation not detected for patchline ${selectedPatchline}. ` +
        `Install this patchline using the Hytale Launcher.\nChecked path ${serverJarPath}`,
    );
    return;
  }

  try {
    updateGradlePropertiesPatchline(workspaceRootPath, selectedPatchline);
    upsertCompanionConfig(workspaceRootPath, context, selectedPatchline);
    updateLaunchJson(workspaceRootPath, context, selectedPatchline, true);

    vscode.window.showInformationMessage(`Updated Hytale mod patchline to ${selectedPatchline}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to update mod patchline: ${message}`);
  }
}

async function pickPatchline(
  currentPatchline: SupportedPatchline,
): Promise<SupportedPatchline | undefined> {
  const selected = await vscode.window.showQuickPick(
    SUPPORTED_PATCHLINES.map(patchline => ({
      label: patchline,
      description: patchline === currentPatchline ? "Current" : undefined,
    })),
    {
      placeHolder: "Choose Hytale patchline for this mod workspace",
    },
  );

  if (!selected) {
    return undefined;
  }

  return selected.label as SupportedPatchline;
}

function getServerJarPath(patchline: SupportedPatchline): string {
  return path.join(
    getHytaleHome(),
    "install",
    patchline,
    "package",
    "game",
    "latest",
    "Server",
    "HytaleServer.jar",
  );
}

function updateGradlePropertiesPatchline(
  workspaceRootPath: string,
  patchline: SupportedPatchline,
): void {
  const gradlePropertiesPath = path.join(workspaceRootPath, GRADLE_PROPERTIES_RELATIVE_PATH);
  if (!fs.existsSync(gradlePropertiesPath)) {
    throw new Error(`gradle.properties not found at: ${gradlePropertiesPath}`);
  }

  const originalContent = fs.readFileSync(gradlePropertiesPath, "utf8");
  const updatedContent = replacePatchlineInGradlePropertiesContent(originalContent, patchline);

  if (updatedContent !== originalContent) {
    fs.writeFileSync(gradlePropertiesPath, updatedContent, "utf8");
  }
}

export function replacePatchlineInGradlePropertiesContent(
  content: string,
  patchline: SupportedPatchline,
): string {
  const patchlineDefinitionRegex = /^(\s*patchline\s*=\s*)(.+?)\s*$/m;
  if (patchlineDefinitionRegex.test(content)) {
    return content.replace(patchlineDefinitionRegex, `$1${patchline}`);
  }

  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  if (content.length === 0) {
    return `patchline=${patchline}${eol}`;
  }

  const hasTrailingLineBreak = content.endsWith("\n") || content.endsWith("\r\n");
  const withTrailingLineBreak = hasTrailingLineBreak ? content : `${content}${eol}`;
  return `${withTrailingLineBreak}patchline=${patchline}${eol}`;
}

function upsertCompanionConfig(
  workspaceRootPath: string,
  context: vscode.ExtensionContext,
  patchline: SupportedPatchline,
): void {
  const companionConfigLocation = resolveCompanionConfigLocation(workspaceRootPath);
  const companionConfigDirectory = path.dirname(companionConfigLocation.writePath);
  fs.mkdirSync(companionConfigDirectory, { recursive: true });

  let parsedDocument: Record<string, unknown> = {};
  if (companionConfigLocation.readPath && fs.existsSync(companionConfigLocation.readPath)) {
    const originalContent = fs.readFileSync(companionConfigLocation.readPath, "utf8");
    if (originalContent.trim().length > 0) {
      try {
        const parsed = JSON.parse(originalContent) as unknown;
        if (!isObject(parsed)) {
          throw new Error("Config root is not a JSON object.");
        }
        parsedDocument = parsed;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Companion config at "${companionConfigLocation.readPath}" is not valid JSON: ${message}`,
        );
      }
    }
  }

  parsedDocument.ExportPath = normalizePathForJson(
    path.join(context.globalStorageUri.fsPath, patchline),
  );
  fs.writeFileSync(
    companionConfigLocation.writePath,
    `${JSON.stringify(parsedDocument, null, 4)}\n`,
    "utf8",
  );

  if (companionConfigLocation.removeLegacyAfterWrite) {
    tryDeleteLegacyCompanionConfig(workspaceRootPath);
  }
}

function updateLaunchJson(
  workspaceRootPath: string,
  context: vscode.ExtensionContext,
  patchline: SupportedPatchline,
  updateAssetsPatchline: boolean,
): void {
  const launchConfigPath = path.join(workspaceRootPath, LAUNCH_CONFIG_RELATIVE_PATH);
  if (!fs.existsSync(launchConfigPath)) {
    return;
  }

  let parsedDocument: LaunchConfigurationDocument;
  try {
    parsedDocument = safeParseJSONFile(launchConfigPath) as LaunchConfigurationDocument;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Launch config at "${launchConfigPath}" is not valid JSON: ${message}`);
  }

  if (!Array.isArray(parsedDocument.configurations)) {
    return;
  }

  const companionModsPath = normalizePathForJson(
    context.asAbsolutePath(COMPANION_MOD_LIBS_RELATIVE_PATH),
  );
  let hasChanges = false;
  for (const configuration of parsedDocument.configurations) {
    if (!isObject(configuration) || !Array.isArray(configuration.args)) {
      continue;
    }

    const args = configuration.args.filter((arg): arg is string => typeof arg === "string");
    const rewritten = rewriteLaunchArgs(args, patchline, companionModsPath, updateAssetsPatchline);

    if (rewritten.changed) {
      configuration.args = rewritten.args;
      hasChanges = true;
    }
  }

  if (hasChanges) {
    fs.writeFileSync(launchConfigPath, `${JSON.stringify(parsedDocument, null, 4)}\n`, "utf8");
  }
}

interface RewriteLaunchArgsResult {
  args: string[];
  changed: boolean;
}

export function rewriteLaunchArgs(
  args: readonly string[],
  patchline: SupportedPatchline,
  companionModsPath: string,
  updateAssetsPatchline: boolean,
  appendMissingCompanionModsArg: boolean = true,
): RewriteLaunchArgsResult {
  const desiredCompanionModsArg = `--mods=${normalizePathForJson(companionModsPath)}`;
  const desiredCompanionModsArgLower = desiredCompanionModsArg.toLowerCase();

  let changed = false;
  let hasCompanionModsArg = false;
  const rewrittenArgs: string[] = [];

  for (const arg of args) {
    let rewrittenArg = arg;
    if (updateAssetsPatchline) {
      const patchedAssetsArg = replaceAssetsPatchlineInArg(rewrittenArg, patchline);
      if (patchedAssetsArg !== rewrittenArg) {
        rewrittenArg = patchedAssetsArg;
        changed = true;
      }
    }

    const normalizedArgLower = normalizePathForJson(rewrittenArg).toLowerCase();
    if (normalizedArgLower === desiredCompanionModsArgLower) {
      if (!hasCompanionModsArg) {
        rewrittenArgs.push(desiredCompanionModsArg);
        hasCompanionModsArg = true;
        if (rewrittenArg !== desiredCompanionModsArg) {
          changed = true;
        }
      } else {
        changed = true;
      }
      continue;
    }

    if (isLegacyCompanionModsArg(rewrittenArg)) {
      rewrittenArgs.push(desiredCompanionModsArg);
      hasCompanionModsArg = true;
      changed = true;
      continue;
    }

    rewrittenArgs.push(rewrittenArg);
  }

  if (!hasCompanionModsArg && appendMissingCompanionModsArg) {
    rewrittenArgs.push(desiredCompanionModsArg);
    changed = true;
  }

  return {
    args: rewrittenArgs,
    changed,
  };
}

export function replaceAssetsPatchlineInArg(arg: string, patchline: SupportedPatchline): string {
  if (!arg.startsWith("--assets=")) {
    return arg;
  }

  const assetsPathPatchlineRegex =
    /([\\/](?:install)[\\/])(release|pre-release)([\\/](?:package)[\\/](?:game)[\\/](?:latest)[\\/](?:Assets\.zip))/i;
  if (!assetsPathPatchlineRegex.test(arg)) {
    return arg;
  }

  return arg.replace(assetsPathPatchlineRegex, `$1${patchline}$3`);
}

function isLegacyCompanionModsArg(arg: string): boolean {
  if (!arg.startsWith("--mods=")) {
    return false;
  }

  const modsValue = normalizePathForJson(arg.slice("--mods=".length));
  return modsValue.includes("companion/HytaleDevtoolsCompanion");
}

function toSupportedPatchline(value: string): SupportedPatchline {
  if (value === "pre-release") {
    return "pre-release";
  }
  return "release";
}

export function detectHytaleModWorkspace(workspaceRootPath: string): boolean {
  const launchConfigPath = path.join(workspaceRootPath, LAUNCH_CONFIG_RELATIVE_PATH);
  if (!fs.existsSync(launchConfigPath)) {
    return false;
  }

  const launchConfigContent = fs.readFileSync(launchConfigPath, "utf8");
  const escapedMainClass = HYTALE_SERVER_MAIN_CLASS.replace(/\./g, "\\.");
  const mainClassRegex = new RegExp(`"mainClass"\\s*:\\s*"${escapedMainClass}"`);
  return mainClassRegex.test(launchConfigContent);
}

function normalizePathForJson(value: string): string {
  return value.replace(/\\/g, "/");
}

interface CompanionConfigLocation {
  readPath?: string;
  writePath: string;
  removeLegacyAfterWrite: boolean;
}

function resolveCompanionConfigLocation(workspaceRootPath: string): CompanionConfigLocation {
  const preferredPath = path.join(workspaceRootPath, COMPANION_CONFIG_RELATIVE_PATH);
  const legacyPath = path.join(workspaceRootPath, LEGACY_COMPANION_CONFIG_RELATIVE_PATH);

  if (fs.existsSync(preferredPath)) {
    return {
      readPath: preferredPath,
      writePath: preferredPath,
      removeLegacyAfterWrite: false,
    };
  }

  if (fs.existsSync(legacyPath)) {
    return {
      readPath: legacyPath,
      writePath: preferredPath,
      removeLegacyAfterWrite: true,
    };
  }

  return {
    writePath: preferredPath,
    removeLegacyAfterWrite: false,
  };
}

function tryDeleteLegacyCompanionConfig(workspaceRootPath: string): void {
  const legacyConfigPath = path.join(workspaceRootPath, LEGACY_COMPANION_CONFIG_RELATIVE_PATH);
  if (!fs.existsSync(legacyConfigPath)) {
    return;
  }

  try {
    fs.unlinkSync(legacyConfigPath);
    deleteEmptyDirectoriesUpTo(path.dirname(legacyConfigPath), path.join(workspaceRootPath, "run"));
  } catch {
    // Keep migration non-fatal if cleanup cannot be completed.
  }
}

function deleteEmptyDirectoriesUpTo(startDirectory: string, stopDirectory: string): void {
  let currentDirectory = startDirectory;
  const normalizedStopDirectory = path.resolve(stopDirectory);

  while (path.resolve(currentDirectory).startsWith(normalizedStopDirectory)) {
    if (path.resolve(currentDirectory) === normalizedStopDirectory) {
      break;
    }

    if (!fs.existsSync(currentDirectory)) {
      break;
    }

    const entries = fs.readdirSync(currentDirectory);
    if (entries.length > 0) {
      break;
    }

    fs.rmdirSync(currentDirectory);
    currentDirectory = path.dirname(currentDirectory);
  }
}

