import type { NpcDocument, NpcParameters, NpcStandardParameterEntry } from "./documentTypes";

export type NpcDocumentParseResult =
  | {
      status: "ready";
      document: NpcDocument;
    }
  | {
      status: "error";
      error: string;
    };

export function parseNpcDocumentText(text: string): NpcDocumentParseResult {
  try {
    const parsed = JSON.parse(text);
    if (!isRecord(parsed)) {
      return {
        status: "error",
        error: "NPC role document root must be a JSON object.",
      };
    }

    return {
      status: "ready",
      document: {
        roleType: typeof parsed.Type === "string" ? parsed.Type : null,
        rawRoot: parsed,
        parameters: parseParameters(parsed.Parameters),
      },
    };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseParameters(value: unknown): NpcParameters | null {
  if (!isRecord(value)) {
    return null;
  }

  const entries: NpcStandardParameterEntry[] = [];
  let importStates: string[] | null = null;
  const excludedEntries: Record<string, unknown> = {};
  const keyOrder = Object.keys(value);

  for (const [parameterName, parameterValue] of Object.entries(value)) {
    if (parameterName === "_ImportStates") {
      if (isStringArray(parameterValue)) {
        importStates = structuredClone(parameterValue);
        continue;
      }

      excludedEntries[parameterName] = structuredClone(parameterValue);
      continue;
    }

    if (parameterName.startsWith("_") || !isRecord(parameterValue) || !("Value" in parameterValue)) {
      excludedEntries[parameterName] = structuredClone(parameterValue);
      continue;
    }

    const entryKeyOrder = Object.keys(parameterValue);
    const {
      Value: rawValue,
      Description,
      TypeHint,
      Private,
      ...extraFields
    } = parameterValue;

    entries.push({
      name: parameterName,
      value: parseStandardParameterValue(rawValue),
      description: typeof Description === "string" ? Description : undefined,
      typeHint: typeof TypeHint === "string" ? TypeHint : undefined,
      private: typeof Private === "boolean" ? Private : undefined,
      keyOrder: entryKeyOrder,
      extraFields: structuredClone(extraFields),
    });
  }

  return {
    entries,
    importStates,
    excludedEntries,
    keyOrder,
  };
}

function parseStandardParameterValue(value: unknown) {
  if (isComputeExpression(value)) {
    return {
      kind: "compute" as const,
      expression: value.Compute,
    };
  }

  return {
    kind: "literal" as const,
    value: structuredClone(value),
  };
}

function isComputeExpression(value: unknown): value is { Compute: string } {
  return isRecord(value) && Object.keys(value).length === 1 && typeof value.Compute === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}
