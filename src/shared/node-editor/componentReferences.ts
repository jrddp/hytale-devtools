import type { NodeChildSchema, NodeTemplate } from "./workspaceTypes";

export const COMPONENT_REFERENCE_MODIFY_FIELD_PREFIX = "$componentReference.Modify.";
export const COMPONENT_REFERENCE_EXPORT_STATE_FIELD_PREFIX =
  "$componentReference.ExportState.";
export const COMPONENT_REFERENCE_MODIFY_MAP_FIELD = "$componentReference.ModifyMap";
export const COMPONENT_REFERENCE_EXPORT_STATES_FIELD = "$componentReference.ExportStates";
export const COMPONENT_REFERENCE_INTERFACE_PARAMETERS_FIELD_PREFIX =
  "$componentReference.InterfaceParameters.";

export type ComponentReferenceSyntheticField =
  | {
      kind: "modify";
      key: string;
    }
  | {
      kind: "export-state";
      index: number;
    }
  | {
      kind: "modify-map";
    }
  | {
      kind: "export-states";
    }
  | {
      kind: "interface-parameters";
      interfaceKey: string;
    };

export function isComponentReferenceNodeTemplate(
  template: Pick<NodeTemplate, "isComponentReference"> | undefined,
): boolean {
  return template?.isComponentReference === true;
}

export function getComponentReferenceSlotOccupancy(
  template: Pick<NodeTemplate, "slotOccupancy"> | undefined,
): "normal-item" | "whole-slot" {
  return template?.slotOccupancy === "whole-slot" ? "whole-slot" : "normal-item";
}

export function allowsComponentReferences(
  childSchema: Pick<NodeChildSchema, "allowComponentReferences"> | undefined,
): boolean {
  return childSchema?.allowComponentReferences === true;
}

export function createComponentReferenceModifyFieldSchemaKey(key: string): string {
  return `${COMPONENT_REFERENCE_MODIFY_FIELD_PREFIX}${key}`;
}

export function createComponentReferenceExportStateFieldSchemaKey(index: number): string {
  return `${COMPONENT_REFERENCE_EXPORT_STATE_FIELD_PREFIX}${index}`;
}

export function createComponentReferenceModifyMapFieldSchemaKey(): string {
  return COMPONENT_REFERENCE_MODIFY_MAP_FIELD;
}

export function createComponentReferenceExportStatesFieldSchemaKey(): string {
  return COMPONENT_REFERENCE_EXPORT_STATES_FIELD;
}

export function createComponentReferenceInterfaceParametersFieldSchemaKey(
  interfaceKey: string,
): string {
  return `${COMPONENT_REFERENCE_INTERFACE_PARAMETERS_FIELD_PREFIX}${interfaceKey}`;
}

export function parseComponentReferenceSyntheticFieldSchemaKey(
  schemaKey: string,
): ComponentReferenceSyntheticField | null {
  if (schemaKey === COMPONENT_REFERENCE_MODIFY_MAP_FIELD) {
    return { kind: "modify-map" };
  }

  if (schemaKey === COMPONENT_REFERENCE_EXPORT_STATES_FIELD) {
    return { kind: "export-states" };
  }

  if (schemaKey.startsWith(COMPONENT_REFERENCE_INTERFACE_PARAMETERS_FIELD_PREFIX)) {
    return {
      kind: "interface-parameters",
      interfaceKey: schemaKey.slice(COMPONENT_REFERENCE_INTERFACE_PARAMETERS_FIELD_PREFIX.length),
    };
  }

  if (schemaKey.startsWith(COMPONENT_REFERENCE_MODIFY_FIELD_PREFIX)) {
    return {
      kind: "modify",
      key: schemaKey.slice(COMPONENT_REFERENCE_MODIFY_FIELD_PREFIX.length),
    };
  }

  if (schemaKey.startsWith(COMPONENT_REFERENCE_EXPORT_STATE_FIELD_PREFIX)) {
    const suffix = schemaKey.slice(COMPONENT_REFERENCE_EXPORT_STATE_FIELD_PREFIX.length);
    const index = Number.parseInt(suffix, 10);
    if (!Number.isNaN(index) && `${index}` === suffix) {
      return {
        kind: "export-state",
        index,
      };
    }
  }

  return null;
}

export function isComponentReferenceSyntheticFieldSchemaKey(schemaKey: string): boolean {
  return parseComponentReferenceSyntheticFieldSchemaKey(schemaKey) !== null;
}
