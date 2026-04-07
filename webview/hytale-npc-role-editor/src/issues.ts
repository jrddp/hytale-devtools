import type { NpcDocument } from "./parsing/documentTypes";
import type { ParameterUsageIndex } from "./compute/parameterUsageIndex";

export type NpcEditorIssue = {
  severity: "warning" | "error";
  code: string;
  message: string;
  fieldPath?: string;
};

export function buildNpcIssues(
  document: NpcDocument,
  parameterUsageIndex: ParameterUsageIndex,
): NpcEditorIssue[] {
  const issues: NpcEditorIssue[] = [];

  for (const entry of document.parameters?.entries ?? []) {
    const usages = parameterUsageIndex.usagesByParameter.get(entry.name);
    if (usages && usages.size > 0) {
      continue;
    }

    issues.push({
      severity: "warning",
      code: "unused-parameter",
      message: `Parameter "${entry.name}" is currently unused.`,
      fieldPath: `Parameters.${entry.name}.Value`,
    });
  }

  return issues;
}

export function buildIssuesByFieldPath(
  issues: NpcEditorIssue[],
): Map<string, NpcEditorIssue[]> {
  const issuesByFieldPath = new Map<string, NpcEditorIssue[]>();

  for (const issue of issues) {
    if (!issue.fieldPath) {
      continue;
    }

    const fieldIssues = issuesByFieldPath.get(issue.fieldPath);
    if (fieldIssues) {
      fieldIssues.push(issue);
      continue;
    }

    issuesByFieldPath.set(issue.fieldPath, [issue]);
  }

  return issuesByFieldPath;
}
