import { type NpcRoleEditorWebviewToExtensionMessage } from "@shared/npc-role-editor/messageTypes";

export type VSCodeApi = {
  postMessage: (message: NpcRoleEditorWebviewToExtensionMessage) => void;
  getState?: () => Record<string, unknown> | undefined;
  setState?: (state: Record<string, unknown>) => unknown;
  isDevEnv?: boolean;
};
