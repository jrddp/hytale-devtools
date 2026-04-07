import type { ComputeAutocompleteOption } from "@webview-shared/components/computeAutocomplete";
import type { NpcStandardParameterEntry } from "../parsing/documentTypes";
import {
  getStandardParameterEditorType,
  getStandardParameterEditorTypeLabel,
} from "../parsing/parameterEditorTypes";

type NpcComputeScopeKind = "standard" | "sensorEval";

const BUILTIN_FUNCTIONS = [
  {
    name: "max",
    description: "Returns the larger of two numbers.",
    signature: "max(a: number, b: number)",
  },
  {
    name: "min",
    description: "Returns the smaller of two numbers.",
    signature: "min(a: number, b: number)",
  },
  {
    name: "isEmpty",
    description: "Returns true if the string is null or empty.",
    signature: "isEmpty(str: string)",
  },
  {
    name: "isEmptyStringArray",
    description: "Returns true if the string array is empty.",
    signature: "isEmptyStringArray(arr: string[])",
  },
  {
    name: "isEmptyNumberArray",
    description: "Returns true if the number array is empty.",
    signature: "isEmptyNumberArray(arr: number[])",
  },
  {
    name: "random",
    description: "Returns a random number between 0 and 1.",
    signature: "random()",
  },
  {
    name: "randomInRange",
    description: "Returns a random number in the given range.",
    signature: "randomInRange(min: number, max: number)",
  },
  {
    name: "makeRange",
    description: "Creates a [value, value] number array from a single number.",
    signature: "makeRange(value: number)",
  },
] as const;

const BUILTIN_CONSTANTS = [
  {
    name: "true",
    description: "Boolean constant.",
  },
  {
    name: "false",
    description: "Boolean constant.",
  },
  {
    name: "PI",
    description: "Number constant.",
  },
] as const;

const SENSOR_EVAL_IDENTIFIERS = [
  {
    name: "health",
    description: "Current NPC health percentage in the sensor-eval scope.",
  },
  {
    name: "blocked",
    description: "Whether the current motion controller is obstructed in the sensor-eval scope.",
  },
] as const;

const BUILTIN_IDENTIFIER_NAMES = new Set<string>([
  ...BUILTIN_FUNCTIONS.map(fn => fn.name),
  ...BUILTIN_CONSTANTS.map(constant => constant.name),
  ...SENSOR_EVAL_IDENTIFIERS.map(identifier => identifier.name),
]);

export function isNpcComputeNonParameterIdentifier(identifier: string): boolean {
  return BUILTIN_IDENTIFIER_NAMES.has(identifier);
}

export function buildNpcComputeAutocompleteOptions({
  parameters,
  scope = "standard",
}: {
  parameters?: NpcStandardParameterEntry[];
  scope?: NpcComputeScopeKind;
}): ComputeAutocompleteOption[] {
  const options: ComputeAutocompleteOption[] = [];

  for (const parameter of parameters ?? []) {
    const typeLabel = getStandardParameterEditorTypeLabel(getStandardParameterEditorType(parameter));
    options.push({
      label: parameter.name,
      insertText: parameter.name,
      kind: "parameter",
      detail: "Parameter",
      description: parameter.description?.trim() || `${typeLabel} parameter.`,
    });
  }

  if (scope === "sensorEval") {
    for (const identifier of SENSOR_EVAL_IDENTIFIERS) {
      options.push({
        label: identifier.name,
        insertText: identifier.name,
        kind: "parameter",
        detail: "Sensor",
        description: identifier.description,
      });
    }
  }

  for (const fn of BUILTIN_FUNCTIONS) {
    options.push({
      label: `${fn.name}()`,
      insertText: `${fn.name}(`,
      kind: "function",
      detail: "Function",
      description: `${fn.signature} — ${fn.description}`,
    });
  }

  for (const constant of BUILTIN_CONSTANTS) {
    options.push({
      label: constant.name,
      insertText: constant.name,
      kind: "constant",
      detail: "Constant",
      description: constant.description,
    });
  }

  return options;
}
