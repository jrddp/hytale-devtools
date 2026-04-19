import type { Workspace } from "../workspace.svelte";
import type { ParameterUsageIndex } from "../compute/parameterUsageIndex";
import { buildIssuesByFieldPath, buildNpcIssues } from "../issues";
import { applyNpcDerivedPropertyMetadata } from "../derivedPropertyMetadata";
import { serializeWorkspaceDocument } from "./documentModel";

export function emptyParameterUsageIndex(): ParameterUsageIndex {
  return {
    usagesByParameter: new Map(),
    directTranslationByFieldPath: new Map(),
  };
}

export function recomputeWorkspaceDerivedState(workspace: Workspace) {
  const document = serializeWorkspaceDocument(workspace);
  if (!document || !workspace.roleType) {
    workspace.parameterUsageIndex = emptyParameterUsageIndex();
    workspace.issues = [];
    workspace.issuesByFieldPath = new Map();
    workspace.discoveredStates = [];
    return;
  }

  const { parameterUsageIndex, discoveredStates } = applyNpcDerivedPropertyMetadata({
    sections: workspace.propertySections,
    document,
    topLevelKeyOrder: workspace.topLevelKeyOrder,
    descriptors: workspace.descriptors,
  });
  const issues = buildNpcIssues({
    roleType: workspace.roleType,
    sections: workspace.propertySections,
    parameterUsageIndex,
    variantReferenceState: workspace.variantReferenceState,
    variantReferenceParameters: workspace.variantReferenceParameters,
  });

  workspace.parameterUsageIndex = parameterUsageIndex;
  workspace.issues = issues;
  workspace.issuesByFieldPath = buildIssuesByFieldPath(issues);
  workspace.discoveredStates = discoveredStates;
}
