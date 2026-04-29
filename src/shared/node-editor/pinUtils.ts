import { INPUT_HANDLE_ID } from "./sharedConstants";
import type { NodeConnectionType, NodePin, NodeTemplate } from "./workspaceTypes";

export const GENERIC_CONNECTION_TYPE = "Generic";
export const SELF_OUTPUT_PIN_LOCAL_ID = "Output";

function getConnectionTypeAncestors(
  connectionTypeId: string,
  connectionTypesById: Record<string, NodeConnectionType> | undefined,
): string[] {
  return connectionTypesById?.[connectionTypeId]?.ancestors ?? [];
}

export function areConnectionTypesCompatible(
  sourceType: string,
  targetType: string,
  connectionTypesById?: Record<string, NodeConnectionType>,
): boolean {
  return (
    sourceType === GENERIC_CONNECTION_TYPE ||
    targetType === GENERIC_CONNECTION_TYPE ||
    sourceType === targetType ||
    getConnectionTypeAncestors(sourceType, connectionTypesById).includes(targetType)
  );
}

export function templateHasCompatibleInput(
  template: NodeTemplate,
  pinType: string,
  connectionTypesById?: Record<string, NodeConnectionType>,
): boolean {
  return template.inputPins.some(pin =>
    areConnectionTypesCompatible(pinType, pin.connectionType, connectionTypesById),
  );
}

export function templateHasCompatibleOutput(
  template: NodeTemplate,
  pinType: string,
  connectionTypesById?: Record<string, NodeConnectionType>,
): boolean {
  return template.outputPins.some(pin =>
    areConnectionTypesCompatible(pin.connectionType, pinType, connectionTypesById),
  );
}

export function getCompatibleInputHandleId(
  nodeOrTemplate: Pick<NodeTemplate, "inputPins">,
  pinType: string,
  connectionTypesById?: Record<string, NodeConnectionType>,
): string | undefined {
  return (
    nodeOrTemplate.inputPins.find(pin => pin.connectionType === pinType)?.schemaKey ??
    nodeOrTemplate.inputPins.find(pin =>
      areConnectionTypesCompatible(pinType, pin.connectionType, connectionTypesById),
    )?.schemaKey
  );
}

export function getCompatibleOutputHandleId(
  nodeOrTemplate: Pick<NodeTemplate, "outputPins">,
  pinType: string,
  connectionTypesById?: Record<string, NodeConnectionType>,
): string | undefined {
  return (
    nodeOrTemplate.outputPins.find(
      pin => pin.localId === SELF_OUTPUT_PIN_LOCAL_ID && pin.connectionType === pinType,
    )?.schemaKey ??
    nodeOrTemplate.outputPins.find(pin => pin.connectionType === pinType)?.schemaKey ??
    nodeOrTemplate.outputPins.find(
      pin =>
        pin.localId === SELF_OUTPUT_PIN_LOCAL_ID &&
        areConnectionTypesCompatible(pin.connectionType, pinType, connectionTypesById),
    )?.schemaKey ??
    nodeOrTemplate.outputPins.find(pin =>
      areConnectionTypesCompatible(pin.connectionType, pinType, connectionTypesById),
    )?.schemaKey
  );
}

export function isDefaultInputHandleSchemaKey(schemaKey: string): boolean {
  if (schemaKey === INPUT_HANDLE_ID) {
    return true;
  }

  if (!schemaKey.startsWith(INPUT_HANDLE_ID)) {
    return false;
  }

  const suffix = schemaKey.slice(INPUT_HANDLE_ID.length);
  return suffix.length > 0 && /^\d+$/.test(suffix);
}

export function isSchemaBoundInputPin(pin: NodePin): boolean {
  return !isDefaultInputHandleSchemaKey(pin.schemaKey);
}

export function shouldShowInputPinLabels(inputPins: readonly NodePin[]): boolean {
  return inputPins.length > 1 || inputPins.some(isSchemaBoundInputPin);
}
