import { isNpcComputeNonParameterIdentifier } from "./computeAutocomplete";

export type ParameterUsageIndex = {
  usagesByParameter: Map<string, Set<string>>;
  directTranslationByFieldPath: Map<string, string>;
};

export function buildParameterUsageIndex(root: Record<string, unknown>): ParameterUsageIndex {
  const usagesByParameter = new Map<string, Set<string>>();
  const directTranslationByFieldPath = new Map<string, string>();

  walkValue(root, []);

  return {
    usagesByParameter,
    directTranslationByFieldPath,
  };

  function walkValue(value: unknown, pathSegments: string[]) {
    if (isComputeExpression(value)) {
      const fieldPath = pathSegments.join(".");
      const expression = value.Compute.trim();

      for (const identifier of extractParameterLikeIdentifiers(expression)) {
        let fieldPaths = usagesByParameter.get(identifier);
        if (!fieldPaths) {
          fieldPaths = new Set<string>();
          usagesByParameter.set(identifier, fieldPaths);
        }

        fieldPaths.add(fieldPath);
      }

      const directTranslation = extractDirectTranslationIdentifier(expression);
      if (directTranslation) {
        directTranslationByFieldPath.set(fieldPath, directTranslation);
      }

      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => walkValue(item, [...pathSegments, String(index)]));
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    for (const [key, childValue] of Object.entries(value)) {
      walkValue(childValue, [...pathSegments, key]);
    }
  }
}

export function extractParameterLikeIdentifiers(expression: string): string[] {
  const normalizedExpression = stripQuotedStrings(expression);
  const identifiers = new Set<string>();

  for (const match of normalizedExpression.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
    const identifier = match[0];
    if (!isNpcComputeNonParameterIdentifier(identifier)) {
      identifiers.add(identifier);
    }
  }

  return [...identifiers];
}

function extractDirectTranslationIdentifier(expression: string): string | null {
  const trimmed = expression.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    return null;
  }

  if (isNpcComputeNonParameterIdentifier(trimmed)) {
    return null;
  }

  return trimmed;
}

function stripQuotedStrings(expression: string): string {
  return expression
    .replace(/"(?:\\.|[^"\\])*"/g, "\"\"")
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function isComputeExpression(value: unknown): value is { Compute: string } {
  return isRecord(value) && Object.keys(value).length === 1 && typeof value.Compute === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
