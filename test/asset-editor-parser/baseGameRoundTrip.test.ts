import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "vitest";

import { SchemaRuntime } from "../../src/schema/schemaLoader";
import { parseDocumentText } from "../../webview/hytale-asset-editor/src/parsing/parseDocument";
import { serializeDocument } from "../../webview/hytale-asset-editor/src/parsing/serializeDocument";

const BASE_GAME_ASSETS_DIR_ENV = "BASE_GAME_ASSETS_DIR";
const schemaDir = path.resolve(process.cwd(), "default-data/export-data/schemas");

loadDotEnv(path.resolve(process.cwd(), ".env"));

function loadDotEnv(envPath: string): void {
  if (!existsSync(envPath)) {
    return;
  }

  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (process.env[key]) {
      continue;
    }

    const value = line.slice(equalsIndex + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    process.env[key] = value;
  }
}

function walkJsonFiles(dirPath: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...walkJsonFiles(fullPath));
      continue;
    }

    if (fullPath.endsWith(".json")) {
      files.push(fullPath);
    }
  }

  return files;
}

function parseJsonText(text: string): unknown {
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => canonicalizeJson(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, childValue]) => [key, canonicalizeJson(childValue)]),
    );
  }

  return typeof value === "number" && Object.is(value, -0) ? 0 : value;
}

function normalizeRoundTripJson(value: unknown, isRoot = true): unknown {
  if (Array.isArray(value)) {
    const normalized = value
      .map(item => normalizeRoundTripJson(item, false))
      .filter(item => item !== undefined);
    return normalized.length > 0 || isRoot ? normalized : undefined;
  }

  if (value && typeof value === "object") {
    const normalized = Object.fromEntries(
      Object.entries(value).flatMap(([key, childValue]) => {
        const normalizedChild = normalizeRoundTripJson(childValue, false);
        return normalizedChild === undefined ? [] : [[key, normalizedChild]];
      }),
    );
    return Object.keys(normalized).length > 0 || isRoot ? normalized : undefined;
  }

  return typeof value === "number" && Object.is(value, -0) ? 0 : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function formatJsonPointer(pointer: string): string {
  return pointer || "/";
}

function summarizeJsonValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `array(length=${value.length})`;
  }

  if (isRecord(value)) {
    const keys = Object.keys(value);
    const preview = keys.slice(0, 5).join(", ");
    return keys.length > 5 ? `object(keys=${preview}, ...)` : `object(keys=${preview})`;
  }

  return JSON.stringify(value);
}

function collectJsonMismatches(
  expected: unknown,
  actual: unknown,
  pointer = "",
  mismatches: string[] = [],
  maxMismatches = 20,
): string[] {
  if (mismatches.length >= maxMismatches) {
    return mismatches;
  }

  if (Object.is(expected, actual)) {
    return mismatches;
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const sharedLength = Math.min(expected.length, actual.length);
    for (let index = 0; index < sharedLength; index += 1) {
      collectJsonMismatches(
        expected[index],
        actual[index],
        `${pointer}/${index}`,
        mismatches,
        maxMismatches,
      );
      if (mismatches.length >= maxMismatches) {
        return mismatches;
      }
    }

    for (let index = sharedLength; index < expected.length; index += 1) {
      mismatches.push(
        `${formatJsonPointer(`${pointer}/${index}`)}: missing in actual, expected ${summarizeJsonValue(
          expected[index],
        )}`,
      );
      if (mismatches.length >= maxMismatches) {
        return mismatches;
      }
    }

    for (let index = sharedLength; index < actual.length; index += 1) {
      mismatches.push(
        `${formatJsonPointer(`${pointer}/${index}`)}: unexpected value in actual ${summarizeJsonValue(
          actual[index],
        )}`,
      );
      if (mismatches.length >= maxMismatches) {
        return mismatches;
      }
    }

    return mismatches;
  }

  if (isRecord(expected) && isRecord(actual)) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    const sortedKeys = [...keys].sort((left, right) => left.localeCompare(right));

    for (const key of sortedKeys) {
      const childPointer = `${pointer}/${escapeJsonPointerSegment(key)}`;
      if (!(key in actual)) {
        mismatches.push(
          `${formatJsonPointer(childPointer)}: missing in actual, expected ${summarizeJsonValue(
            expected[key],
          )}`,
        );
      } else if (!(key in expected)) {
        mismatches.push(
          `${formatJsonPointer(childPointer)}: unexpected value in actual ${summarizeJsonValue(
            actual[key],
          )}`,
        );
      } else {
        collectJsonMismatches(expected[key], actual[key], childPointer, mismatches, maxMismatches);
      }

      if (mismatches.length >= maxMismatches) {
        return mismatches;
      }
    }

    return mismatches;
  }

  mismatches.push(
    `${formatJsonPointer(pointer)}: expected ${summarizeJsonValue(expected)}, actual ${summarizeJsonValue(
      actual,
    )}`,
  );
  return mismatches;
}

function describeRoundTripMismatch(expected: unknown, actual: unknown, maxMismatches = 20): string {
  const mismatches = collectJsonMismatches(expected, actual, "", [], maxMismatches);
  if (mismatches.length === 0) {
    return "Round-trip mismatch, but no differing paths were identified.";
  }

  const totalMismatches = collectJsonMismatches(expected, actual, "", [], Number.POSITIVE_INFINITY);
  const remainingCount = totalMismatches.length - mismatches.length;

  return [
    "Round-trip mismatch.",
    ...mismatches.map(mismatch => `- ${mismatch}`),
    remainingCount > 0 ? `- ...and ${remainingCount} more mismatches` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

describe("asset editor BaseGame round-trip", () => {
  const baseGameAssetsDir = process.env[BASE_GAME_ASSETS_DIR_ENV];

  test.skipIf(!baseGameAssetsDir)(
    "round-trips supported BaseGame assets",
    () => {
      const normalizedAssetsRoot = path.resolve(baseGameAssetsDir!, "Server");
      if (!existsSync(normalizedAssetsRoot)) {
        throw new Error(`BaseGame Server directory not found: ${normalizedAssetsRoot}`);
      }

      const schemaRuntime = new SchemaRuntime(schemaDir, console);
      const assetsByRef = Object.fromEntries(schemaRuntime.assetsByRef);
      const supportedAssetPaths = walkJsonFiles(normalizedAssetsRoot).filter(assetPath =>
        schemaRuntime.getAssetDefinitionForPath(assetPath),
      );

      if (supportedAssetPaths.length === 0) {
        throw new Error(`No supported asset-editor files found under ${normalizedAssetsRoot}`);
      }

      const failures: string[] = [];

      for (const [index, assetPath] of supportedAssetPaths.entries()) {
        if (index % 100 === 0) {
          console.log(
            `[asset-editor round-trip] ${index + 1}/${supportedAssetPaths.length}: ${path.relative(
              normalizedAssetsRoot,
              assetPath,
            )}`,
          );
        }

        const assetDefinition = schemaRuntime.getAssetDefinitionForPath(assetPath);
        if (!assetDefinition) {
          continue;
        }

        try {
          const originalJson = parseJsonText(readFileSync(assetPath, "utf8"));
          const result = parseDocumentText({
            text: JSON.stringify(originalJson),
            assetDefinition,
            assetsByRef,
          });

          if (result.status === "error") {
            throw new Error(result.error);
          }

          const serializedJson = serializeDocument(result.rootField);
          const actual = canonicalizeJson(normalizeRoundTripJson(serializedJson));
          const expected = canonicalizeJson(normalizeRoundTripJson(originalJson));

          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error(describeRoundTripMismatch(expected, actual));
          }
        } catch (error) {
          failures.push(`${assetPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (failures.length > 0) {
        throw new Error(
          `${failures.slice(0, 20).join("\n")}${
            failures.length > 20 ? `\n...and ${failures.length - 20} more failures` : ""
          }`,
        );
      }
    },
    300_000,
  );
});
