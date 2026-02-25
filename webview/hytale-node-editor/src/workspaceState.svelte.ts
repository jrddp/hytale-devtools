import { type NodeEditorWorkspaceContext } from "@shared/node-editor/workspaceTypes";
import { type FlowEdge, type FlowNode } from "src/node-editor/graph/graphTypes";

export interface WorkspaceState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  rootNodeId: string;
}
export interface ActiveNodeWorkspace {
  context?: NodeEditorWorkspaceContext;
  state?: WorkspaceState;
}

export const workspace: ActiveNodeWorkspace = $state({});
