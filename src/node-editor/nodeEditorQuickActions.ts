import * as vscode from "vscode";
import {
  resolveNodeEditorQuickActionCommand,
  type NodeEditorQuickActionPayload,
} from "../shared/node-editor/quickActions";
import { isObject } from "../shared/typeUtils";

export function registerNodeEditorQuickActionCommands(
  context: vscode.ExtensionContext,
  {
    commandPrefix,
    postAction,
    logger,
  }: {
    commandPrefix: string;
    postAction: (payload: NodeEditorQuickActionPayload) => void | Promise<void>;
    logger?: Pick<vscode.LogOutputChannel, "error" | "warn">;
  },
): vscode.Disposable[] {
  return readNodeEditorQuickActionCommandIds(context, commandPrefix, logger).map(commandId =>
    vscode.commands.registerCommand(commandId, () => {
      const payload = resolveNodeEditorQuickActionCommand(commandId, commandPrefix);
      if (!payload) {
        logger?.warn(`Unable to resolve node editor quick action for command ${commandId}.`);
        return;
      }

      void postAction(payload);
    }),
  );
}

function readNodeEditorQuickActionCommandIds(
  context: vscode.ExtensionContext,
  commandPrefix: string,
  logger?: Pick<vscode.LogOutputChannel, "error" | "warn">,
): string[] {
  const packageJson = context.extension.packageJSON as unknown;
  if (!isObject(packageJson)) {
    logger?.error("Commands unable to be parsed from package.json.");
    return [];
  }

  const contributes = packageJson.contributes;
  const commands = isObject(contributes) ? contributes.commands : undefined;
  if (!Array.isArray(commands)) {
    logger?.warn("No commands found in package.json contributes.");
    return [];
  }

  return commands
    .map(command => (isObject(command) ? command.command : undefined))
    .filter((commandId): commandId is string => {
      return typeof commandId === "string" && commandId.startsWith(commandPrefix);
    });
}
