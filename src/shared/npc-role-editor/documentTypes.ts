export type NpcRoleType = "Generic" | "Abstract" | "Variant" | "Component";

export const NPC_COMPONENT_CLASSES = [
  "Action",
  "ActionList",
  "BodyMotion",
  "HeadMotion",
  "Instruction",
  "Path",
  "Role",
  "Sensor",
] as const;

export type NpcComponentClass =
  | "Action"
  | "ActionList"
  | "BodyMotion"
  | "HeadMotion"
  | "Instruction"
  | "Path"
  | "Role"
  | "Sensor"
  | (string & {});

export type NpcJsonValue =
  | string
  | number
  | boolean
  | null
  | NpcJsonValue[]
  | { [key: string]: NpcJsonValue };

export type NpcComputeJson = {
  Compute: string;
};

export type NpcParameterValueJson = NpcJsonValue | NpcComputeJson;

export type NpcParameterDefinitionJson = {
  Value: NpcParameterValueJson;
  Description?: string;
  TypeHint?: string;
  Validate?: string;
  Confine?: string;
  Private?: boolean;
  [key: string]: unknown;
};

export type NpcParametersJson = {
  _ImportStates?: string[];
  [parameterName: string]: NpcParameterDefinitionJson | unknown;
};

export type NpcModifyJson = {
  _ExportStates?: string[];
  _CombatConfig?: unknown;
  _InteractionVars?: unknown;
  [key: string]: unknown;
};

export type NpcGenericRoleJson = {
  Type: "Generic" | "Abstract";
  Parameters?: NpcParametersJson;
  InteractionInstruction?: unknown;
  DeathInstruction?: unknown;
  MotionControllerList?: unknown;
  StateTransitions?: unknown;
  TestType?: string;
  FailReason?: string;
  [key: string]: unknown;
};

export type NpcVariantRoleJson = {
  Type: "Variant";
  Reference?: string | NpcComputeJson;
  Modify?: NpcModifyJson;
  Parameters?: NpcParametersJson;
  TestType?: string;
  FailReason?: string;
  [key: string]: unknown;
};

export type NpcComponentRoleJson = {
  Type: "Component";
  Class?: string;
  Interface?: string;
  DefaultState?: string;
  ResetOnStateChange?: boolean;
  Content?: unknown;
  Parameters?: NpcParametersJson;
  TestType?: string;
  FailReason?: string;
  [key: string]: unknown;
};

export type NpcRoleJson =
  | NpcGenericRoleJson
  | NpcVariantRoleJson
  | NpcComponentRoleJson;

export function isNpcRoleType(value: unknown): value is NpcRoleType {
  return (
    value === "Generic" ||
    value === "Abstract" ||
    value === "Variant" ||
    value === "Component"
  );
}

export function isNpcComputeJson(value: unknown): value is NpcComputeJson {
  return isRecord(value) && Object.keys(value).length === 1 && typeof value.Compute === "string";
}

export function isNpcRoleJson(value: unknown): value is NpcRoleJson {
  return isRecord(value) && isNpcRoleType(value.Type);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
