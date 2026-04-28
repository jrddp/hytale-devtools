import type { ActionRequest } from "./messageTypes";

export type NodeEditorQuickActionPayload = {
  request: ActionRequest;
  allowEditableTarget?: boolean;
};

export function resolveNodeEditorQuickActionCommand(
  commandId: string,
  commandPrefix: string,
): NodeEditorQuickActionPayload | undefined {
  if (!commandId.startsWith(commandPrefix)) {
    return undefined;
  }

  const actionType = commandId.slice(commandPrefix.length);
  switch (actionType) {
    case "go-to-root":
      return { request: { type: "reveal-node" } };
    case "fit-view":
      return { request: { type: "fit-view" } };
    case "search-nodes":
      return {
        request: { type: "search-nodes" },
        allowEditableTarget: true,
      };
    case "select-all":
      return { request: { type: "select-all" } };
    case "auto-position-nodes":
      return { request: { type: "auto-position-nodes" } };
    case "view-raw-json":
      return { request: { type: "view-raw-json" } };
    case "help-and-hotkeys":
      return { request: { type: "help-and-hotkeys" } };
    default:
      return undefined;
  }
}
