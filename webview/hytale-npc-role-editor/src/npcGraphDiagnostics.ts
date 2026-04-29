import type { IndexReference } from "@shared/indexTypes";
import {
  type NodeEditorDiagnostic,
  type NodeEditorDiagnosticTarget,
} from "@shared/node-editor/diagnostics";
import { isComputeParameterMapValue, isParameterMap } from "@shared/node-editor/parameterMap";
import type { NodeField, NodePin } from "@shared/node-editor/workspaceTypes";
import { validateNpcComputeExpression } from "./compute/computeValidation";
import type { NpcRoleEditorComponentReferenceTargetState } from "@shared/npc-role-editor/messageTypes";
import type { NodeEditorSession } from "@node-editor/workspace.svelte";

const DIAGNOSTIC_SOURCE = "npc-graph";

export type NpcGraphDiagnosticsContext = {
  session: NodeEditorSession;
  graphFieldPath: string;
  availableParameters: Set<string>;
  getIndexValues: (requestId: string) => string[] | undefined;
  requestIndexValues: (requestId: string, symbolLookup: IndexReference) => void;
  getComponentReferenceTarget: (
    componentClass: string,
    referenceName: string,
  ) => NpcRoleEditorComponentReferenceTargetState | undefined;
  requestComponentReferenceTarget: (componentClass: string, referenceName: string) => void;
};

export function buildNpcGraphDiagnostics({
  session,
  graphFieldPath,
  availableParameters,
  getIndexValues,
  requestIndexValues,
  getComponentReferenceTarget,
  requestComponentReferenceTarget,
}: NpcGraphDiagnosticsContext): NodeEditorDiagnostic[] {
  const diagnostics: NodeEditorDiagnostic[] = [];

  for (const node of session.nodes) {
    if (node.type !== "datanode") {
      continue;
    }

    for (const field of Object.values(node.data.fieldsBySchemaKey)) {
      validateField({
        diagnostics,
        graphFieldPath,
        nodeId: node.id,
        field,
        availableParameters,
        getIndexValues,
        requestIndexValues,
      });
    }

    for (const pin of node.data.inputPins) {
      validateRequiredPin({
        diagnostics,
        graphFieldPath,
        nodeId: node.id,
        pin,
        direction: "input",
        connectionCount: session.getIncomingConnectionsForHandle(node.id, pin.schemaKey).length,
      });
    }

    for (const pin of node.data.outputPins) {
      validateRequiredPin({
        diagnostics,
        graphFieldPath,
        nodeId: node.id,
        pin,
        direction: "output",
        connectionCount: session.getOutgoingConnectionsForHandle(node.id, pin.schemaKey).length,
      });
    }

    validateComponentReference({
      diagnostics,
      graphFieldPath,
      nodeId: node.id,
      componentClass: node.data.componentReferenceClass,
      referenceField: node.data.fieldsBySchemaKey.Reference,
      interfacesField: node.data.fieldsBySchemaKey.Interfaces,
      getComponentReferenceTarget,
      requestComponentReferenceTarget,
    });
  }

  return diagnostics;
}

function validateField({
  diagnostics,
  graphFieldPath,
  nodeId,
  field,
  availableParameters,
  getIndexValues,
  requestIndexValues,
}: {
  diagnostics: NodeEditorDiagnostic[];
  graphFieldPath: string;
  nodeId: string;
  field: NodeField;
  availableParameters: Set<string>;
  getIndexValues: (requestId: string) => string[] | undefined;
  requestIndexValues: (requestId: string, symbolLookup: IndexReference) => void;
}) {
  if (!field.schemaKey) {
    return;
  }

  const target: NodeEditorDiagnosticTarget = {
    type: "field",
    nodeId,
    schemaKey: field.schemaKey,
  };
  const effectiveValue = getEffectiveFieldValue(field);
  const isComputed = isComputeValue(effectiveValue);

  if (field.required && isMissingRequiredValue(field, effectiveValue)) {
    diagnostics.push(createDiagnostic(graphFieldPath, "error", "required-field-missing", "Required field is unset.", target));
  }

  if (isComputed) {
    addComputeDiagnostics({
      diagnostics,
      graphFieldPath,
      target,
      expression: effectiveValue.Compute,
      availableParameters,
    });
    return;
  }

  validateStringConstraints({ diagnostics, graphFieldPath, target, field, effectiveValue });
  validateNumberConstraints({ diagnostics, graphFieldPath, target, field, effectiveValue });
  validateListConstraints({
    diagnostics,
    graphFieldPath,
    nodeId,
    field,
    effectiveValue,
    getIndexValues,
    requestIndexValues,
  });
  validateTupleConstraints({ diagnostics, graphFieldPath, target, field, effectiveValue });
  validateParameterMap({
    diagnostics,
    graphFieldPath,
    nodeId,
    field,
    effectiveValue,
    availableParameters,
  });
  validateScalarEnumAndAssetReference({
    diagnostics,
    graphFieldPath,
    target,
    field,
    effectiveValue,
    getIndexValues,
    requestIndexValues,
  });
}

function validateStringConstraints({
  diagnostics,
  graphFieldPath,
  target,
  field,
  effectiveValue,
}: {
  diagnostics: NodeEditorDiagnostic[];
  graphFieldPath: string;
  target: NodeEditorDiagnosticTarget;
  field: NodeField;
  effectiveValue: unknown;
}) {
  if (!field.disallowEmpty || typeof effectiveValue !== "string") {
    return;
  }

  if (effectiveValue.trim().length === 0) {
    diagnostics.push(createDiagnostic(graphFieldPath, "error", "empty-string", "Value cannot be empty.", target));
  }
}

function validateNumberConstraints({
  diagnostics,
  graphFieldPath,
  target,
  field,
  effectiveValue,
}: {
  diagnostics: NodeEditorDiagnostic[];
  graphFieldPath: string;
  target: NodeEditorDiagnosticTarget;
  field: NodeField;
  effectiveValue: unknown;
}) {
  if (typeof effectiveValue !== "number") {
    return;
  }

  addNumericBoundsDiagnostics({
    diagnostics,
    graphFieldPath,
    target,
    field,
    value: effectiveValue,
  });
}

function validateListConstraints({
  diagnostics,
  graphFieldPath,
  nodeId,
  field,
  effectiveValue,
  getIndexValues,
  requestIndexValues,
}: {
  diagnostics: NodeEditorDiagnostic[];
  graphFieldPath: string;
  nodeId: string;
  field: NodeField;
  effectiveValue: unknown;
  getIndexValues: (requestId: string) => string[] | undefined;
  requestIndexValues: (requestId: string, symbolLookup: IndexReference) => void;
}) {
  if (field.type !== "list" || !Array.isArray(effectiveValue) || !field.schemaKey) {
    return;
  }

  const target: NodeEditorDiagnosticTarget = {
    type: "field",
    nodeId,
    schemaKey: field.schemaKey,
  };

  addListSizeDiagnostics({ diagnostics, graphFieldPath, target, field, values: effectiveValue });

  const seenItems = new Map<string, number>();
  const autocompleteValues = getFieldAllowedValues(field, getIndexValues, requestIndexValues);

  effectiveValue.forEach((item, itemIndex) => {
    const itemTarget: NodeEditorDiagnosticTarget = {
      type: "listItem",
      nodeId,
      schemaKey: field.schemaKey!,
      itemIndex,
    };

    if (field.disallowEmptyItems && typeof item === "string" && item.trim().length === 0) {
      diagnostics.push(createDiagnostic(graphFieldPath, "error", "empty-list-item", "List item cannot be empty.", itemTarget));
    }

    if (
      autocompleteValues &&
      typeof item === "string" &&
      item.length > 0 &&
      !autocompleteValues.has(item)
    ) {
      diagnostics.push(createDiagnostic(graphFieldPath, "error", "invalid-list-item", "Value is not in the allowed list.", itemTarget));
    }

    if (typeof item === "number") {
      addNumericBoundsDiagnostics({
        diagnostics,
        graphFieldPath,
        target: itemTarget,
        field,
        value: item,
      });
    }

    if (field.uniqueItems && (typeof item === "string" || typeof item === "number" || typeof item === "boolean")) {
      const key = JSON.stringify(item);
      const firstIndex = seenItems.get(key);
      if (firstIndex !== undefined) {
        diagnostics.push(createDiagnostic(graphFieldPath, "error", "duplicate-list-item", "Duplicate values are not allowed.", itemTarget));
      } else {
        seenItems.set(key, itemIndex);
      }
    }
  });
}

function validateTupleConstraints({
  diagnostics,
  graphFieldPath,
  target,
  field,
  effectiveValue,
}: {
  diagnostics: NodeEditorDiagnostic[];
  graphFieldPath: string;
  target: NodeEditorDiagnosticTarget;
  field: NodeField;
  effectiveValue: unknown;
}) {
  if (field.type !== "tuple" || !Array.isArray(effectiveValue)) {
    return;
  }

  if (field.tupleSize !== undefined && effectiveValue.length !== field.tupleSize) {
    diagnostics.push(createDiagnostic(graphFieldPath, "error", "tuple-size", `Expected ${field.tupleSize} values.`, target));
  }

  effectiveValue.forEach(value => {
    if (typeof value === "number") {
      addNumericBoundsDiagnostics({
        diagnostics,
        graphFieldPath,
        target,
        field,
        value,
      });
    }
  });
}

function validateParameterMap({
  diagnostics,
  graphFieldPath,
  nodeId,
  field,
  effectiveValue,
  availableParameters,
}: {
  diagnostics: NodeEditorDiagnostic[];
  graphFieldPath: string;
  nodeId: string;
  field: NodeField;
  effectiveValue: unknown;
  availableParameters: Set<string>;
}) {
  if (field.type !== "parameterMap" || !field.schemaKey || !isParameterMap(effectiveValue)) {
    return;
  }

  for (const [key, value] of Object.entries(effectiveValue)) {
    if (!isComputeParameterMapValue(value)) {
      continue;
    }

    addComputeDiagnostics({
      diagnostics,
      graphFieldPath,
      target: {
        type: "mapEntry",
        nodeId,
        schemaKey: field.schemaKey,
        key,
      },
      expression: value.Compute,
      availableParameters,
    });
  }
}

function validateScalarEnumAndAssetReference({
  diagnostics,
  graphFieldPath,
  target,
  field,
  effectiveValue,
  getIndexValues,
  requestIndexValues,
}: {
  diagnostics: NodeEditorDiagnostic[];
  graphFieldPath: string;
  target: NodeEditorDiagnosticTarget;
  field: NodeField;
  effectiveValue: unknown;
  getIndexValues: (requestId: string) => string[] | undefined;
  requestIndexValues: (requestId: string, symbolLookup: IndexReference) => void;
}) {
  if (typeof effectiveValue !== "string" || effectiveValue.trim().length === 0) {
    return;
  }

  const allowedValues = getFieldAllowedValues(field, getIndexValues, requestIndexValues);
  if (!allowedValues || allowedValues.has(effectiveValue)) {
    return;
  }

  diagnostics.push(createDiagnostic(graphFieldPath, "error", "invalid-value", "Value is not in the allowed list.", target));
}

function validateRequiredPin({
  diagnostics,
  graphFieldPath,
  nodeId,
  pin,
  direction,
  connectionCount,
}: {
  diagnostics: NodeEditorDiagnostic[];
  graphFieldPath: string;
  nodeId: string;
  pin: NodePin;
  direction: "input" | "output";
  connectionCount: number;
}) {
  if (!pin.required || connectionCount > 0) {
    return;
  }

  diagnostics.push(
    createDiagnostic(
      graphFieldPath,
      "error",
      "required-child-missing",
      "Required connection is missing.",
      {
        type: "pin",
        nodeId,
        pinId: pin.schemaKey,
        direction,
      },
    ),
  );
}

function validateComponentReference({
  diagnostics,
  graphFieldPath,
  nodeId,
  componentClass,
  referenceField,
  interfacesField,
  getComponentReferenceTarget,
  requestComponentReferenceTarget,
}: {
  diagnostics: NodeEditorDiagnostic[];
  graphFieldPath: string;
  nodeId: string;
  componentClass?: string;
  referenceField?: NodeField;
  interfacesField?: NodeField;
  getComponentReferenceTarget: (
    componentClass: string,
    referenceName: string,
  ) => NpcRoleEditorComponentReferenceTargetState | undefined;
  requestComponentReferenceTarget: (componentClass: string, referenceName: string) => void;
}) {
  if (!componentClass || !referenceField?.schemaKey) {
    return;
  }

  const referenceValue = getEffectiveFieldValue(referenceField);
  if (isComputeValue(referenceValue)) {
    validateComputedReferenceInterfaces({
      diagnostics,
      graphFieldPath,
      nodeId,
      referenceField,
      interfacesField,
    });
    return;
  }

  if (typeof referenceValue !== "string" || referenceValue.trim().length === 0) {
    return;
  }

  const target = getComponentReferenceTarget(componentClass, referenceValue);
  if (!target) {
    requestComponentReferenceTarget(componentClass, referenceValue);
    return;
  }

  if (target.status === "missing" || target.status === "error") {
    diagnostics.push(
      createDiagnostic(
        graphFieldPath,
        "error",
        target.status === "missing" ? "component-reference-missing" : "component-reference-error",
        target.message ?? "Referenced component could not be resolved.",
        {
          type: "field",
          nodeId,
          schemaKey: referenceField.schemaKey,
        },
      ),
    );
  }
}

function validateComputedReferenceInterfaces({
  diagnostics,
  graphFieldPath,
  nodeId,
  referenceField,
  interfacesField,
}: {
  diagnostics: NodeEditorDiagnostic[];
  graphFieldPath: string;
  nodeId: string;
  referenceField: NodeField;
  interfacesField?: NodeField;
}) {
  if (!interfacesField?.schemaKey) {
    return;
  }

  const interfacesValue = getEffectiveFieldValue(interfacesField);
  if (Array.isArray(interfacesValue) && interfacesValue.length > 0) {
    return;
  }

  diagnostics.push(
    createDiagnostic(
      graphFieldPath,
      "warning",
      "computed-reference-missing-interfaces",
      "Computed references should specify at least one allowed interface.",
      {
        type: "field",
        nodeId,
        schemaKey: referenceField.schemaKey!,
      },
    ),
  );
}

function addComputeDiagnostics({
  diagnostics,
  graphFieldPath,
  target,
  expression,
  availableParameters,
}: {
  diagnostics: NodeEditorDiagnostic[];
  graphFieldPath: string;
  target: NodeEditorDiagnosticTarget;
  expression: string;
  availableParameters: Set<string>;
}) {
  const validation = validateNpcComputeExpression(expression, availableParameters);

  if (validation.errors.some(error => error.startsWith("Parse error:"))) {
    diagnostics.push(createDiagnostic(graphFieldPath, "error", "compute-parse-error", "Invalid expression.", target));
  }

  if (validation.unresolvedVariables.length > 0) {
    diagnostics.push(
      createDiagnostic(
        graphFieldPath,
        "error",
        "compute-unresolved-variable",
        validation.unresolvedVariables.length === 1 ? "Unknown parameter." : "Unknown parameters.",
        target,
      ),
    );
  }
}

function addListSizeDiagnostics({
  diagnostics,
  graphFieldPath,
  target,
  field,
  values,
}: {
  diagnostics: NodeEditorDiagnostic[];
  graphFieldPath: string;
  target: NodeEditorDiagnosticTarget;
  field: NodeField;
  values: unknown[];
}) {
  if (field.minItems !== undefined && values.length < field.minItems) {
    diagnostics.push(createDiagnostic(graphFieldPath, "error", "list-min-items", `Expected at least ${field.minItems} items.`, target));
  }
  if (field.maxItems !== undefined && values.length > field.maxItems) {
    diagnostics.push(createDiagnostic(graphFieldPath, "error", "list-max-items", `Expected at most ${field.maxItems} items.`, target));
  }
}

function addNumericBoundsDiagnostics({
  diagnostics,
  graphFieldPath,
  target,
  field,
  value,
}: {
  diagnostics: NodeEditorDiagnostic[];
  graphFieldPath: string;
  target: NodeEditorDiagnosticTarget;
  field: NodeField;
  value: number;
}) {
  if (
    field.minValue !== undefined &&
    (field.minValueExclusive ? value <= field.minValue : value < field.minValue)
  ) {
    diagnostics.push(
      createDiagnostic(
        graphFieldPath,
        "error",
        "numeric-min",
        `Value must be ${field.minValueExclusive ? "greater than" : "at least"} ${field.minValue}.`,
        target,
      ),
    );
  }

  if (
    field.maxValue !== undefined &&
    (field.maxValueExclusive ? value >= field.maxValue : value > field.maxValue)
  ) {
    diagnostics.push(
      createDiagnostic(
        graphFieldPath,
        "error",
        "numeric-max",
        `Value must be ${field.maxValueExclusive ? "less than" : "at most"} ${field.maxValue}.`,
        target,
      ),
    );
  }
}

function getFieldAllowedValues(
  field: NodeField,
  getIndexValues: (requestId: string) => string[] | undefined,
  requestIndexValues: (requestId: string, symbolLookup: IndexReference) => void,
): Set<string> | undefined {
  if (field.overrideAutocompleteValues) {
    return new Set(field.overrideAutocompleteValues);
  }

  if (!field.symbolLookup) {
    return undefined;
  }

  const requestId = getSymbolLookupRequestId(field.symbolLookup);
  const values = getIndexValues(requestId);
  if (values === undefined) {
    requestIndexValues(requestId, field.symbolLookup);
    return undefined;
  }

  return new Set(values);
}

function getSymbolLookupRequestId(symbolLookup: IndexReference): string {
  return `node-diagnostics:${JSON.stringify(symbolLookup)}`;
}

function isMissingRequiredValue(field: NodeField, effectiveValue: unknown): boolean {
  if (!field.isSet && field.defaultValue !== undefined) {
    return false;
  }

  if (isComputeValue(effectiveValue)) {
    return effectiveValue.Compute.trim().length === 0;
  }

  if (effectiveValue === undefined || effectiveValue === null) {
    return true;
  }

  if (typeof effectiveValue === "string") {
    return effectiveValue.trim().length === 0;
  }

  if (Array.isArray(effectiveValue)) {
    return effectiveValue.length === 0;
  }

  return false;
}

function getEffectiveFieldValue(field: NodeField): unknown {
  if (!field.isSet && field.defaultValue !== undefined) {
    return field.defaultValue;
  }

  return field.value;
}

function isComputeValue(value: unknown): value is { Compute: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { Compute?: unknown }).Compute === "string"
  );
}

function createDiagnostic(
  graphFieldPath: string,
  severity: "error" | "warning",
  code: string,
  message: string,
  target: NodeEditorDiagnosticTarget,
): NodeEditorDiagnostic {
  return {
    severity,
    code,
    message,
    source: DIAGNOSTIC_SOURCE,
    target,
    graphFieldPath,
  };
}
