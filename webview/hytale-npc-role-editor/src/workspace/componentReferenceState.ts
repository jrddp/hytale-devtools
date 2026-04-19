import type { Workspace } from "../workspace.svelte";
import type {
  NpcRoleEditorComponentReferenceTargetState,
  NpcRoleEditorWebviewToExtensionMessage,
} from "@shared/npc-role-editor/messageTypes";

export function requestWorkspaceComponentReferenceTarget(
  workspace: Workspace,
  componentClass: string,
  referenceName: string,
) {
  const trimmedReferenceName = referenceName.trim();
  if (!workspace.documentPath || !componentClass || !trimmedReferenceName) {
    return;
  }

  const cacheKey = getWorkspaceComponentReferenceTargetCacheKey(
    workspace,
    componentClass,
    trimmedReferenceName,
  );
  const existing = workspace.componentReferenceTargets.get(cacheKey);
  if (
    existing &&
    (existing.status === "loading" ||
      existing.status === "loaded" ||
      existing.status === "missing" ||
      existing.status === "error")
  ) {
    return;
  }

  const nextTargets = new Map(workspace.componentReferenceTargets);
  nextTargets.set(cacheKey, {
    status: "loading",
    componentClass,
    referenceName: trimmedReferenceName,
  });
  workspace.componentReferenceTargets = nextTargets;
  workspace.componentReferenceTargetVersion += 1;
  workspace.vscode.postMessage({
    type: "resolveComponentReferenceTarget",
    componentClass,
    referenceName: trimmedReferenceName,
  } satisfies NpcRoleEditorWebviewToExtensionMessage);
}

export function setWorkspaceComponentReferenceTarget(
  workspace: Workspace,
  target: NpcRoleEditorComponentReferenceTargetState,
) {
  if (!workspace.documentPath || !target.componentClass || !target.referenceName) {
    return;
  }

  const nextTargets = new Map(workspace.componentReferenceTargets);
  nextTargets.set(
    getWorkspaceComponentReferenceTargetCacheKey(
      workspace,
      target.componentClass,
      target.referenceName,
    ),
    target,
  );
  workspace.componentReferenceTargets = nextTargets;
  workspace.componentReferenceTargetVersion += 1;
}

export function getWorkspaceComponentReferenceTarget(
  workspace: Workspace,
  componentClass: string,
  referenceName: string,
): NpcRoleEditorComponentReferenceTargetState | undefined {
  const trimmedReferenceName = referenceName.trim();
  if (!workspace.documentPath || !componentClass || !trimmedReferenceName) {
    return undefined;
  }

  return workspace.componentReferenceTargets.get(
    getWorkspaceComponentReferenceTargetCacheKey(
      workspace,
      componentClass,
      trimmedReferenceName,
    ),
  );
}

function getWorkspaceComponentReferenceTargetCacheKey(
  workspace: Workspace,
  componentClass: string,
  referenceName: string,
): string {
  return `${workspace.documentPath}::${componentClass}::${referenceName}`;
}
