export type NpcStandardParameterValue =
  | {
      kind: "literal";
      value: unknown;
    }
  | {
      kind: "compute";
      expression: string;
    };

export type NpcStandardParameterEntry = {
  name: string;
  value: NpcStandardParameterValue;
  description?: string;
  typeHint?: string;
  private?: boolean;
  keyOrder: string[];
  extraFields: Record<string, unknown>;
};

export type NpcParameters = {
  entries: NpcStandardParameterEntry[];
  excludedEntries: Record<string, unknown>;
  keyOrder: string[];
};

export type NpcDocument = {
  roleType: string | null;
  rawRoot: Record<string, unknown>;
  parameters: NpcParameters | null;
};
