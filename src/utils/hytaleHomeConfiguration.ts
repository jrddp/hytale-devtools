import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  CUSTOM_HYTALE_PATH_SETTING_ID,
  getDefaultHytaleHomePath,
  getDefaultHytaleHomeSearchPaths,
  getConfiguredHytaleHomePath,
} from "./hytalePaths";

const EXTENSION_CONFIG_NAMESPACE = "hytale-devtools";
const CUSTOM_HYTALE_PATH_SETTING_KEY = "customHytalePath";
const SET_CUSTOM_HYTALE_PATH_ACTION = "Set Custom Path";
const OPEN_HYTALE_PATH_SETTINGS_ACTION = "Open Settings";

let startupPromptShown = false;

export async function ensureHytaleHomeConfiguredOnStartup(): Promise<void> {
  if (startupPromptShown) {
    return;
  }

  const configuredPath = getConfiguredHytaleHomePath();
  const checkedPaths = configuredPath ? [configuredPath] : getDefaultHytaleHomeSearchPaths();
  if (checkedPaths.some(currentPath => fs.existsSync(currentPath))) {
    return;
  }

  startupPromptShown = true;

  const checkedPathList = checkedPaths.map(currentPath => `"${currentPath}"`).join(", ");
  const selection = await vscode.window.showErrorMessage(
    `Hytale installation was not detected. Checked ${checkedPathList}. Set "${CUSTOM_HYTALE_PATH_SETTING_ID}" to the Hytale root folder containing "install" and "UserData". Example: ${getDefaultHytaleHomePath()}`,
    SET_CUSTOM_HYTALE_PATH_ACTION,
    OPEN_HYTALE_PATH_SETTINGS_ACTION,
  );

  if (selection === SET_CUSTOM_HYTALE_PATH_ACTION) {
    await promptForCustomHytalePath();
    return;
  }

  if (selection === OPEN_HYTALE_PATH_SETTINGS_ACTION) {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      CUSTOM_HYTALE_PATH_SETTING_ID,
    );
  }
}

export async function promptForCustomHytalePath(): Promise<void> {
  const config = vscode.workspace.getConfiguration(EXTENSION_CONFIG_NAMESPACE);
  const existingPath = getConfiguredHytaleHomePath(config) ?? "";
  const examplePath = getDefaultHytaleHomePath();
  const customPath = await vscode.window.showInputBox({
    prompt:
      'Enter the root Hytale path. This should be the folder containing subdirectories like "install" and "UserData".',
    placeHolder: examplePath,
    value: existingPath,
    validateInput: currentValue =>
      currentValue.trim().length === 0 ? "Enter the root Hytale path." : undefined,
  });

  if (customPath === undefined) {
    return;
  }

  await config.update(
    CUSTOM_HYTALE_PATH_SETTING_KEY,
    customPath.trim(),
    vscode.ConfigurationTarget.Global,
  );

  const resolvedPath = path.normalize(customPath.trim());
  if (fs.existsSync(resolvedPath)) {
    void vscode.window.showInformationMessage(`Saved custom Hytale path: ${resolvedPath}`);
    return;
  }

  void vscode.window.showWarningMessage(
    `Saved custom Hytale path, but "${resolvedPath}" does not currently contain "install" or "UserData".`,
  );
}
