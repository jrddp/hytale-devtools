import { XYPosition } from "@xyflow/svelte";
import { flextree } from "d3-flextree";
import { FlowNode } from "src/common";
import {
  getAbsolutePosition,
  getOrderedChildren,
  getRootIds,
} from "src/node-editor/utils/nodeUtils.svelte";
import { workspace } from "src/workspace.svelte";

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
export function getAutoPositionedMappings(nodes: FlowNode[]): Map<string, XYPosition> {
  // https://github.com/Klortho/d3-flextree
  const layout = flextree<TreeNode>({});

  const nodePositionMappings = new Map<string, XYPosition>();
  // all hierarchies should be disjoint since they are internally processed from unique roots
  for (const hierarchy of generateNodeHierarchies(nodes)) {
    const root = workspace.getNodeById(hierarchy.id);
    const rootPosition = getAbsolutePosition(root);
    const rootHeight = root.measured.height;

    const tree = layout.hierarchy(hierarchy); // load hierarchy
    layout(tree); // compute layout
    tree.each(treeNode =>
      // ! d3-flextree only supports vertical layouts, so we'll just swap width and height and coordinates to make it horizontal.
      nodePositionMappings.set(treeNode.data.id, {
        x: treeNode.y + rootPosition.x,
        // d3-flextree gives positions as it they were centered on the edge that they connect to, so we must reorient y based on node + root height
        y:
          treeNode.x +
          rootPosition.y -
          workspace.getNodeById(treeNode.data.id).measured.height / 2 +
          rootHeight / 2,
      }),
    );
  }

  return nodePositionMappings;
}

/** Includes all children of the provided nodes. */
export function generateNodeHierarchies(nodes: FlowNode[]): HierarchyStructure[] {
  const rootIds = getRootIds(nodes.map(node => node.id));
  return rootIds.map(rootId => generateNodeHierarchyFromNodeId(rootId));
}

export function generateNodeHierarchyFromNodeId(nodeId: string): HierarchyStructure {
  const node = workspace.getNodeById(nodeId);
  const orderedChildren = getOrderedChildren(nodeId);
  return {
    id: nodeId,
    // ! d3-flextree only supports vertical layouts, so we'll just swap width and height and coordinates to make it horizontal.
    // we also create spacing by mocking a large size instead of the original dimensions...
    // d3-flextree was chosen because its minimal footprint and efficient - other dependencies are heavier and generally overkill for a strict tree
    size: [node.measured.height + SPACING_Y, node.measured.width + SPACING_X],
    children: orderedChildren.map(child => generateNodeHierarchyFromNodeId(child.id)),
  };
}
