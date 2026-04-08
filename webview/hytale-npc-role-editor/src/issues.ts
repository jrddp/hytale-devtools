import type { ParameterUsageIndex } from "./compute/parameterUsageIndex";
import { validateNpcComputeExpression } from "./compute/computeValidation";
import type { NpcPropertyField, NpcPropertySection } from "./propertyModel";

export type NpcEditorIssue = {
  severity: "warning" | "error";
  code: string;
  message: string;
  fieldPath?: string;
};

export function buildNpcIssues({
  roleType,
  sections,
  parameterUsageIndex,
}: {
  roleType: string | null;
  sections: NpcPropertySection[];
  parameterUsageIndex: ParameterUsageIndex;
}): NpcEditorIssue[] {
  const issues: NpcEditorIssue[] = [];
  const parameterSection = sections.find(section => section.id === "parameters");
  const roleAttributesSection = sections.find(section => section.id === "roleAttributes");
  const parameterFields = (parameterSection?.fields ?? []).filter(isStandardParameterField);
  const availableParameters = new Set(parameterFields.map(field => field.key));

  for (const field of parameterFields) {
    if (field.value.kind !== "compute") {
      continue;
    }

    const validation = validateNpcComputeExpression(field.value.expression, availableParameters);
    issues.push(...buildComputeIssues(validation, field.fieldPath));
  }

  if (roleType === "Generic" || roleType === "Abstract") {
    for (const field of roleAttributesSection?.fields ?? []) {
      if (field.value.kind !== "compute") {
        continue;
      }

      const validation = validateNpcComputeExpression(field.value.expression, availableParameters);
      issues.push(...buildComputeIssues(validation, field.fieldPath));
    }
  }

  for (const field of parameterFields) {
    const usages = parameterUsageIndex.usagesByParameter.get(field.key);
    if (usages && usages.size > 0) {
      continue;
    }

    issues.push({
      severity: "warning",
      code: "unused-parameter",
      message: `Parameter "${field.key}" is currently unused.`,
      fieldPath: field.fieldPath,
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

function isStandardParameterField(field: NpcPropertyField): boolean {
  return field.fieldPath.startsWith("Parameters.") && field.key !== "_ImportStates";
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
