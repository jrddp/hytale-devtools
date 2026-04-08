import type { NpcRoleEditorVariantReferenceState } from "@shared/npc-role-editor/messageTypes";
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
  variantReferenceState,
  variantReferenceParameters,
}: {
  roleType: string | null;
  sections: NpcPropertySection[];
  parameterUsageIndex: ParameterUsageIndex;
  variantReferenceState?: NpcRoleEditorVariantReferenceState;
  variantReferenceParameters?: NpcPropertyField[];
}): NpcEditorIssue[] {
  const issues: NpcEditorIssue[] = [];
  const parameterSection = sections.find(section => section.id === "parameters");
  const roleAttributesSection = sections.find(section => section.id === "roleAttributes");
  const variantReferenceSection = sections.find(section => section.id === "variantReference");
  const modifySection = sections.find(section => section.id === "modify");
  const parameterFields = (parameterSection?.fields ?? []).filter(isStandardParameterField);
  const availableParameters = new Set(parameterFields.map(field => field.key));
  const variantReferenceParametersByName = new Map(
    (variantReferenceParameters ?? []).map(field => [field.key, field] as const),
  );

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

  for (const field of modifySection?.fields ?? []) {
    if (field.key.startsWith("_") || field.value.kind !== "compute") {
      continue;
    }

    const validation = validateNpcComputeExpression(field.value.expression, availableParameters);
    issues.push(...buildComputeIssues(validation, field.fieldPath));
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

  const referenceField = variantReferenceSection?.fields.find(field => field.fieldPath === "Reference");
  if (referenceField) {
    if (variantReferenceState?.status === "missing") {
      issues.push({
        severity: "warning",
        code: "variant-reference-missing",
        message: "Reference could not be resolved.",
        fieldPath: referenceField.fieldPath,
      });
    } else if (variantReferenceState?.status === "error") {
      issues.push({
        severity: "warning",
        code: "variant-reference-error",
        message:
          referenceField.value.kind === "compute"
            ? "Reference must be a static role name."
            : "Reference could not be resolved.",
        fieldPath: referenceField.fieldPath,
      });
    }
  }

  if (variantReferenceState?.status === "loaded") {
    for (const field of modifySection?.fields ?? []) {
      if (field.key.startsWith("_")) {
        continue;
      }

      const inheritedField = variantReferenceParametersByName.get(field.key);
      if (!inheritedField) {
        issues.push({
          severity: "warning",
          code: "variant-modify-missing-parameter",
          message: "Override does not exist on the referenced role.",
          fieldPath: field.fieldPath,
        });
        continue;
      }

      if (inheritedField.preservedData?.Private === true) {
        issues.push({
          severity: "warning",
          code: "variant-modify-private-parameter",
          message: "Override targets a private reference parameter.",
          fieldPath: field.fieldPath,
        });
      }
    }
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
