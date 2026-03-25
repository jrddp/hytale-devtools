import type {
  NodeEditorGraphDocument,
  NodeEditorGraphEdit,
  NodeEditorGraphNode,
  NodeMoveChange,
  NodeRenameChange,
  NodeResizeChange,
} from "./graphTypes";

function indexNodesById(document: NodeEditorGraphDocument): Map<string, NodeEditorGraphNode> {
  return new Map(document.nodes.map(node => [node.id, node]));
}

function applyNodeMoveChanges(
  document: NodeEditorGraphDocument,
  changes: NodeMoveChange[],
  target: "before" | "after",
): void {
  const nodesById = indexNodesById(document);
  for (const change of changes) {
    const node = nodesById.get(change.nodeId);
    if (!node) {
      continue;
    }

    node.position = { ...change[target].position };
    node.parentId = change[target].parentId;
  }
}

function applyNodeRenameChanges(
  document: NodeEditorGraphDocument,
  changes: NodeRenameChange[],
  target: "before" | "after",
): void {
  const nodesById = indexNodesById(document);
  for (const change of changes) {
    const node = nodesById.get(change.nodeId);
    if (!node) {
      continue;
    }

    node.data.titleOverride =
      target === "before" ? change.beforeTitleOverride : change.afterTitleOverride;
  }
}

function applyNodeResizeChanges(
  document: NodeEditorGraphDocument,
  changes: NodeResizeChange[],
  target: "before" | "after",
): void {
  const nodesById = indexNodesById(document);
  for (const change of changes) {
    const node = nodesById.get(change.nodeId);
    if (!node || ("width" in node) === false || ("height" in node) === false) {
      continue;
    }

    const dimensions = change[target];
    node.width = dimensions.width ?? node.width;
    node.height = dimensions.height ?? node.height;
  }
}

export function applyNodeEditorGraphEdit(
  document: NodeEditorGraphDocument,
  edit: NodeEditorGraphEdit,
  target: "before" | "after" = "after",
): void {
  switch (edit.kind) {
    case "nodes-moved":
      applyNodeMoveChanges(document, edit.changes, target);
      return;
    case "node-renamed":
      applyNodeRenameChanges(document, edit.changes, target);
      return;
    case "node-resized":
      applyNodeResizeChanges(document, edit.changes, target);
      return;
  }
}

export function invertNodeEditorGraphEdit(
  edit: NodeEditorGraphEdit,
): NodeEditorGraphEdit {
  switch (edit.kind) {
    case "nodes-moved":
      return {
        kind: edit.kind,
        changes: edit.changes.map(change => ({
          nodeId: change.nodeId,
          before: change.after,
          after: change.before,
        })),
      };
    case "node-renamed":
      return {
        kind: edit.kind,
        changes: edit.changes.map(change => ({
          nodeId: change.nodeId,
          beforeTitleOverride: change.afterTitleOverride,
          afterTitleOverride: change.beforeTitleOverride,
        })),
      };
    case "node-resized":
      return {
        kind: edit.kind,
        changes: edit.changes.map(change => ({
          nodeId: change.nodeId,
          before: change.after,
          after: change.before,
        })),
      };
  }
}
