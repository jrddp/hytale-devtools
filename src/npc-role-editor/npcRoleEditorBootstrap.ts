import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { workspaceRuntime } from "../extension";
import type {
  NpcDescriptorDocument,
  NpcDescriptorSource,
} from "../shared/npc-role-editor/descriptorTypes";
import type { NpcRoleEditorBootstrapMessage } from "../shared/npc-role-editor/messageTypes";
import type {
  NodeEditorControlScheme,
  NodeEditorPlatform,
} from "../shared/node-editor/messageTypes";
import type { NodeEditorClipboardSelection } from "../shared/node-editor/clipboardTypes";
import { resolveDataRootDirFromContext, resolveDefaultSchemaDataRoot } from "../utils/hytalePaths";

const NPC_DESCRIPTOR_FILE_NAME = "npc_descriptors.json";
const EXTENSION_CONFIG_NAMESPACE = "hytale-devtools";
const NODE_EDITOR_CONTROL_SCHEME_SETTING_KEY = "nodeEditor.controlScheme";
const DEFAULT_NODE_EDITOR_CONTROL_SCHEME: NodeEditorControlScheme = "mouse";

export type LoadedNpcDescriptors = {
  descriptors: NpcDescriptorDocument;
  descriptorPath: string;
  descriptorSource: NpcDescriptorSource;
};

export function buildNpcRoleEditorBootstrapMessage(
  context: vscode.ExtensionContext,
  clipboard: NodeEditorClipboardSelection,
): NpcRoleEditorBootstrapMessage {
  return {
    type: "bootstrap",
    ...loadNpcDescriptors(context),
    isDevelopment: context.extensionMode === vscode.ExtensionMode.Development,
    nodeEditorControlScheme: readNodeEditorControlScheme(),
    nodeEditorPlatform: readNodeEditorPlatform(),
    nodeEditorClipboard: clipboard,
    npcBehaviorGraphContexts: {
      Instructions:
        workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", "Instructions") ??
        undefined,
      Instruction:
        workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", "Instruction") ??
        undefined,
      Sensor: workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", "Sensor") ?? undefined,
      StateTransitions:
        workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", "StateTransitions") ??
        undefined,
    },
  };
}

export function loadNpcDescriptors(context: vscode.ExtensionContext): LoadedNpcDescriptors {
  const activeDataRoot = resolveDataRootDirFromContext(context);
  const defaultDataRoot = resolveDefaultSchemaDataRoot(context.extensionPath);
  const candidates: Array<{ descriptorPath: string; descriptorSource: NpcDescriptorSource }> = [
    {
      descriptorPath: path.join(activeDataRoot.rootPath, NPC_DESCRIPTOR_FILE_NAME),
      descriptorSource: activeDataRoot.source,
    },
  ];

  if (path.normalize(defaultDataRoot) !== path.normalize(activeDataRoot.rootPath)) {
    candidates.push({
      descriptorPath: path.join(defaultDataRoot, NPC_DESCRIPTOR_FILE_NAME),
      descriptorSource: "default-data",
    });
  }

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.descriptorPath)) {
      continue;
    }

    const parsed = JSON.parse(fs.readFileSync(candidate.descriptorPath, "utf8"));
    if (!Array.isArray(parsed)) {
      throw new Error(`NPC descriptor file at ${candidate.descriptorPath} was not an array.`);
    }

    return {
      descriptors: parsed as NpcDescriptorDocument,
      descriptorPath: candidate.descriptorPath,
      descriptorSource: candidate.descriptorSource,
    };
  }

  throw new Error(
    `NPC descriptor export was not found in ${candidates.map(candidate => candidate.descriptorPath).join(" or ")}`,
  );
}

function readNodeEditorControlScheme(): NodeEditorControlScheme {
  const configuredValue = vscode.workspace
    .getConfiguration(EXTENSION_CONFIG_NAMESPACE)
    .get<string>(NODE_EDITOR_CONTROL_SCHEME_SETTING_KEY);
  if (configuredValue === "trackpad") {
    return "trackpad";
  }

  return DEFAULT_NODE_EDITOR_CONTROL_SCHEME;
}

function readNodeEditorPlatform(): NodeEditorPlatform {
  if (process.platform === "darwin") {
    return "mac";
  }

  if (process.platform === "linux") {
    return "linux";
  }

  return "win";
}
