import type { NpcDocument } from "./parsing/documentTypes";
import type { ParameterUsageIndex } from "./compute/parameterUsageIndex";
import { validateNpcComputeExpression } from "./compute/computeValidation";
import { isNpcRoleAttributeKey } from "./roleAttributes";

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
  const availableParameters = new Set(document.parameters?.entries.map(entry => entry.name) ?? []);

  for (const entry of document.parameters?.entries ?? []) {
    if (entry.value.kind !== "compute") {
      continue;
    }

    const validation = validateNpcComputeExpression(entry.value.expression, availableParameters);
    issues.push(...buildComputeIssues(validation, `Parameters.${entry.name}.Value`));
  }

  if (document.roleType !== "Variant") {
    for (const [key, value] of Object.entries(document.rawRoot)) {
      if (!isNpcRoleAttributeKey(key) || !isComputeExpression(value)) {
        continue;
      }

      const validation = validateNpcComputeExpression(value.Compute, availableParameters);
      issues.push(...buildComputeIssues(validation, key));
    }
  }

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

function isComputeExpression(value: unknown): value is { Compute: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as { Compute?: unknown }).Compute === "string"
  );
}

function buildComputeIssues(
  validation: ReturnType<typeof validateNpcComputeExpression>,
  fieldPath: string,
): NpcEditorIssue[] {
  const issues: NpcEditorIssue[] = [];

  if (validation.errors.some(error => error.startsWith("Parse error:"))) {
    issues.push({
      severity: "error",
      code: "compute-parse-error",
      message: "Invalid expression.",
      fieldPath,
    });
  }

  if (validation.unresolvedVariables.length > 0) {
    issues.push({
      severity: "error",
      code: "compute-unresolved-variable",
      message:
        validation.unresolvedVariables.length === 1
          ? "Unknown parameter."
          : "Unknown parameters.",
      fieldPath,
    });
  }

  return issues;
}
