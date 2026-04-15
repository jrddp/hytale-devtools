import type { XYPosition } from "@xyflow/svelte";
import { flextree } from "d3-flextree";
import type { FlowNode } from "@node-editor/common";
import {
  getAbsolutePosition,
  getOrderedChildren,
  getRootIds,
} from "@node-editor/node-editor/utils/nodeUtils.svelte";
import type { NodeDataUpdates, NodeUpdates } from "@node-editor/node-editor/utils/nodeUtils.svelte";
import type { NodeEditorSession } from "@node-editor/workspace.svelte";

const SPACING_X = 150;
const SPACING_Y = 75;

type TreeNode = {
  id: string;
  size: [number, number];
};

type HierarchyStructure = TreeNode & {
  children: HierarchyStructure[];
};

/** * @returns A map of nodeId -> {x, y}, where {x, y} is the new absolute position of the node.
 * **Note:** Since positions are absolute, if groups have been calculated parentIds should be set to null then recalculated.
 */
export function getAutoPositionNodeUpdates(
  nodes: FlowNode[],
  session: NodeEditorSession,
): NodeUpdates[] {
  // https://github.com/Klortho/d3-flextree
  const layout = flextree<TreeNode>({});
  const updates: NodeUpdates[] = [];

  // all hierarchies should be disjoint since they are internally processed from unique roots
  for (const hierarchy of generateNodeHierarchies(nodes, session)) {
    const root = session.getNodeById(hierarchy.id);
    const rootPosition = getAbsolutePosition(root, session);
    const rootHeight = root.measured.height;

    const tree = layout.hierarchy(hierarchy); // load hierarchy
    layout(tree); // compute layout
    tree.each((treeNode) => {
      // ! d3-flextree only supports vertical layouts, so we'll just swap width and height and coordinates to make it horizontal.
      const currenPosition = session.getNodeById(treeNode.data.id).position;
      const newPosition = {
        x: treeNode.y + rootPosition.x,
        y:
          treeNode.x +
          rootPosition.y -
          session.getNodeById(treeNode.data.id).measured.height / 2 +
          rootHeight / 2,
      };
      if (
        newPosition.x === currenPosition.x &&
        newPosition.y === currenPosition.y
      )
        return;
      updates.push([treeNode.data.id, { position: newPosition, parentId: undefined }]);
    });
  }

  return updates;
}

/** Includes all children of the provided nodes. */
export function generateNodeHierarchies(
  nodes: FlowNode[],
  session: NodeEditorSession,
): HierarchyStructure[] {
  const rootIds = getRootIds(nodes.map((node) => node.id), session);
  return rootIds.map((rootId) => generateNodeHierarchyFromNodeId(rootId, session));
}

export function generateNodeHierarchyFromNodeId(
  nodeId: string,
  session: NodeEditorSession,
): HierarchyStructure {
  const node = session.getNodeById(nodeId);
  const orderedChildren = getOrderedChildren(nodeId, session);
  return {
    id: nodeId,
    // ! d3-flextree only supports vertical layouts, so we'll just swap width and height and coordinates to make it horizontal.
    // we also create spacing by mocking a large size instead of the original dimensions...
    // d3-flextree was chosen because its minimal footprint and efficient - other dependencies are heavier and generally overkill for a strict tree
    size: [node.measured.height + SPACING_Y, node.measured.width + SPACING_X],
    children: orderedChildren.map((child) => generateNodeHierarchyFromNodeId(child.id, session)),
  };
}
