import type { NodeEditorGraphEdit } from "./graphTypes";
import type { NodeEditorGraphEditMessage } from "./messageTypes";

export function graphEditMessageToGraphEdit(message: NodeEditorGraphEditMessage): NodeEditorGraphEdit {
  switch (message.kind) {
    case "element-list-changed":
      return {
        kind: message.kind,
        addedNodes: message.addedNodes,
        removedNodes: message.removedNodes,
        addedEdges: message.addedEdges,
        removedEdges: message.removedEdges,
        beforeRootNodeId: message.beforeRootNodeId,
        afterRootNodeId: message.afterRootNodeId,
      };
    case "nodes-moved":
      return {
        kind: message.kind,
        changes: message.changes,
      };
    case "node-renamed":
      return {
        kind: message.kind,
        changes: message.changes,
      };
    case "node-resized":
      return {
        kind: message.kind,
        changes: message.changes,
      };
    case "node-properties-updated":
      return {
        kind: message.kind,
        propertyChanges: message.propertyChanges,
        resizeChanges: message.resizeChanges,
      };
  }
}
