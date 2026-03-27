import type {
  NodeEditorGraphDocument,
  NodeEditorGraphEdit,
  NodeEditorGraphEdge,
  NodeEditorGraphNode,
  NodeEditorGraphPropertyChange,
  NodeMoveChange,
  NodeRenameChange,
  NodeResizeChange,
} from "./graphTypes";

function indexNodesById(document: NodeEditorGraphDocument): Map<string, NodeEditorGraphNode> {
  return new Map(document.nodes.map(node => [node.id, node]));
}

function cloneGraphNode(node: NodeEditorGraphNode): NodeEditorGraphNode {
  return structuredClone(node);
}

function cloneGraphEdge(edge: NodeEditorGraphEdge): NodeEditorGraphEdge {
  return { ...edge };
}

function applyElementListChanged(
  document: NodeEditorGraphDocument,
  edit: Extract<NodeEditorGraphEdit, { kind: "element-list-changed" }>,
  target: "before" | "after",
): void {
  const removedNodeIds = new Set(
    (target === "before" ? edit.addedNodes : edit.removedNodes).map(node => node.id),
  );
  const removedEdgeIds = new Set(
    (target === "before" ? edit.addedEdges : edit.removedEdges).map(edge => edge.id),
  );
  const addedNodes = target === "before" ? edit.removedNodes : edit.addedNodes;
  const addedEdges = target === "before" ? edit.removedEdges : edit.addedEdges;

  document.nodes = document.nodes
    .filter(node => !removedNodeIds.has(node.id))
    .concat(addedNodes.map(cloneGraphNode));
  document.edges = document.edges
    .filter(edge => !removedEdgeIds.has(edge.id))
    .concat(addedEdges.map(cloneGraphEdge));
  document.rootNodeId = target === "before" ? edit.beforeRootNodeId : edit.afterRootNodeId;
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

function applyNodePropertyChanges(
  document: NodeEditorGraphDocument,
  changes: NodeEditorGraphPropertyChange[],
  target: "before" | "after",
): void {
  const nodesById = indexNodesById(document);
  for (const change of changes) {
    const node = nodesById.get(change.nodeId);
    if (!node) {
      continue;
    }

    switch (change.type) {
      case "field-value":
        if (node.data.fieldsBySchemaKey?.[change.schemaKey]) {
          const field = node.data.fieldsBySchemaKey[change.schemaKey];
          field.value = target === "before" ? change.beforeValue : change.afterValue;
          field.isImplicit =
            target === "before" ? change.beforeIsImplicit : change.afterIsImplicit;
        }
        break;
      case "comment":
        node.data.comment = target === "before" ? change.beforeComment : change.afterComment;
        break;
      case "font-size":
        if ("fontSize" in node.data) {
          node.data.fontSize =
            target === "before" ? change.beforeFontSize : change.afterFontSize;
        }
        break;
      case "raw-json":
        if ("jsonString" in node.data) {
          node.data.jsonString =
            target === "before" ? change.beforeJsonString : change.afterJsonString;
        }
        break;
    }
  }
}

export function applyNodeEditorGraphEdit(
  document: NodeEditorGraphDocument,
  edit: NodeEditorGraphEdit,
  target: "before" | "after" = "after",
): void {
  switch (edit.kind) {
    case "element-list-changed":
      applyElementListChanged(document, edit, target);
      return;
    case "nodes-moved":
      applyNodeMoveChanges(document, edit.changes, target);
      return;
    case "node-renamed":
      applyNodeRenameChanges(document, edit.changes, target);
      return;
    case "node-resized":
      applyNodeResizeChanges(document, edit.changes, target);
      return;
    case "node-properties-updated":
      applyNodePropertyChanges(document, edit.propertyChanges, target);
      if (edit.resizeChanges?.length) {
        applyNodeResizeChanges(document, edit.resizeChanges, target);
      }
      return;
  }
}

export function invertNodeEditorGraphEdit(
  edit: NodeEditorGraphEdit,
): NodeEditorGraphEdit {
  switch (edit.kind) {
    case "element-list-changed":
      return {
        kind: edit.kind,
        addedNodes: edit.removedNodes.map(cloneGraphNode),
        removedNodes: edit.addedNodes.map(cloneGraphNode),
        addedEdges: edit.removedEdges.map(cloneGraphEdge),
        removedEdges: edit.addedEdges.map(cloneGraphEdge),
        beforeRootNodeId: edit.afterRootNodeId,
        afterRootNodeId: edit.beforeRootNodeId,
      };
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
    case "node-properties-updated":
      return {
        kind: edit.kind,
        propertyChanges: edit.propertyChanges.map(change => {
          switch (change.type) {
            case "field-value":
              return {
                ...change,
                beforeValue: change.afterValue,
                afterValue: change.beforeValue,
                beforeIsImplicit: change.afterIsImplicit,
                afterIsImplicit: change.beforeIsImplicit,
              };
            case "comment":
              return {
                ...change,
                beforeComment: change.afterComment,
                afterComment: change.beforeComment,
              };
            case "font-size":
              return {
                ...change,
                beforeFontSize: change.afterFontSize,
                afterFontSize: change.beforeFontSize,
              };
            case "raw-json":
              return {
                ...change,
                beforeJsonString: change.afterJsonString,
                afterJsonString: change.beforeJsonString,
              };
          }
        }),
        resizeChanges: edit.resizeChanges?.map(change => ({
          nodeId: change.nodeId,
          before: change.after,
          after: change.before,
        })),
      };
  }
}
