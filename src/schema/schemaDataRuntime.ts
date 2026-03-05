import * as fs from "fs";
import * as vscode from "vscode";

const RELOAD_DEBOUNCE_MS = 150;

export function createSchemaDataRuntime(
  context: vscode.ExtensionContext,
  reloadSchemaData: (reason: string) => void,
): vscode.Disposable {
  fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });

  let reloadTimeout: NodeJS.Timeout | undefined;
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(context.globalStorageUri, "*/export_manifest.json"),
  );

  const scheduleReload = (reason: string): void => {
    if (reloadTimeout) {
      clearTimeout(reloadTimeout);
    }

    reloadTimeout = setTimeout(() => {
      reloadTimeout = undefined;
      reloadSchemaData(reason);
    }, RELOAD_DEBOUNCE_MS);
  };

  return vscode.Disposable.from(
    watcher,
    watcher.onDidCreate(() => scheduleReload("export manifest created")),
    watcher.onDidChange(() => scheduleReload("export manifest changed")),
    watcher.onDidDelete(() => scheduleReload("export manifest deleted")),
    new vscode.Disposable(() => {
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }
    }),
  );
}
