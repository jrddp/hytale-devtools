import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

export type SupportedPatchline = "release" | "pre-release";

const DEFAULT_PATCHLINE: SupportedPatchline = "release";

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

export function resolveCompanionExportRoot(
  context: vscode.ExtensionContext,
  workspacePath: string,
): string {
  return resolveCompanionExportRootFromPatchline(
    context.globalStorageUri.fsPath,
    resolvePatchlineForContext(context),
  );
}
