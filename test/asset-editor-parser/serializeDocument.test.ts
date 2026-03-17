import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

import type {
  ArrayField,
  Field,
  FieldBase,
  InlineOrReferenceField,
  MapField,
  NumberField,
  ObjectField,
  RefField,
  StringField,
  VariantField,
} from "@shared/fieldTypes";
import type { RootFieldInstance } from "../../webview/hytale-asset-editor/src/parsing/fieldInstances";
import { parseDocumentText } from "../../webview/hytale-asset-editor/src/parsing/parseDocument.svelte";
import { serializeDocument } from "../../webview/hytale-asset-editor/src/parsing/serializeDocument";

const BASE_GAME_ASSETS_DIR_ENV = "BASE_GAME_ASSETS_DIR";

loadDotEnv(path.resolve(process.cwd(), ".env"));

function baseField(schemaKey: string | null, type: FieldBase["type"]): FieldBase {
  return {
    schemaKey,
    type,
    section: "General",
    collapsedByDefault: false,
  };
}

function stringField(schemaKey: string, overrides: Partial<StringField> = {}): StringField {
  return {
    ...baseField(schemaKey, "string"),
    ...overrides,
  };
}

function numberField(schemaKey: string, overrides: Partial<NumberField> = {}): NumberField {
  return {
    ...baseField(schemaKey, "number"),
    ...overrides,
  };
}

function refField(schemaKey: string, $ref: string): RefField {
  return {
    ...baseField(schemaKey, "ref"),
    $ref,
  };
}

function objectField(
  schemaKey: string | null,
  properties: Record<string, Field>,
): ObjectField {
  return {
    ...baseField(schemaKey, "object"),
    properties,
  };
}

function arrayField(schemaKey: string, items: ArrayField["items"]): ArrayField {
  return {
    ...baseField(schemaKey, "array"),
    items,
  };
}

function mapField(schemaKey: string, valueField: Field): MapField {
  return {
    ...baseField(schemaKey, "map"),
    keyField: stringField(schemaKey),
    valueField,
  };
}

function inlineOrReferenceField(
  schemaKey: string,
  inlineField: InlineOrReferenceField["inlineField"],
): InlineOrReferenceField {
  return {
    ...baseField(schemaKey, "inlineOrReference"),
    stringField: stringField(schemaKey),
    inlineField,
  };
}

function variantField(
  schemaKey: string,
  identityKey: string,
  variantsByIdentity: Record<string, ObjectField>,
): VariantField {
  return {
    ...baseField(schemaKey, "variant"),
    identityField: {
      ...stringField(identityKey),
      enumVals: Object.keys(variantsByIdentity),
    },
    variantsByIdentity,
  };
}

function parseUntilReady({
  text,
  rootField,
  resolveRef = () => null,
}: {
  text: string;
  rootField: ObjectField | VariantField;
  resolveRef?: (refId: string) => Field | null;
}): RootFieldInstance {
  const resolvedRefsByRef = new Map<string, Field | null>();

  for (let pass = 0; pass < 100; pass += 1) {
    const result = parseDocumentText({
      text,
      rootField,
      resolvedRefsByRef,
    });

    switch (result.status) {
      case "ready":
        return result.rootField;
      case "error":
        throw new Error(result.error);
      case "waiting-for-refs": {
        let resolvedMissingRef = false;

        for (const refId of result.missingRefs) {
          if (resolvedRefsByRef.has(refId)) {
            continue;
          }

          resolvedRefsByRef.set(refId, resolveRef(refId) ?? null);
          resolvedMissingRef = true;
        }

        if (!resolvedMissingRef) {
          throw new Error(`Parser remained stuck waiting for refs: ${result.missingRefs.join(", ")}`);
        }
        break;
      }
    }
  }

  throw new Error("Parser exceeded 100 ref-resolution passes.");
}

function parseJsonText(text: string): unknown {
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
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

describe("asset editor serializeDocument", () => {
  test("round-trips representative parsed documents", () => {
    const rootField = objectField(null, {
      name: stringField("name"),
      details: objectField("details", {
        tier: stringField("tier"),
      }),
      tags: arrayField("tags", stringField("tag")),
      dimensions: arrayField("dimensions", [numberField("x"), numberField("y")]),
      labels: mapField("labels", stringField("label")),
      owner: refField("owner", "owner#"),
      item: variantField("item", "kind", {
        armor: objectField("", {
          kind: stringField("kind", { const: "armor" }),
          defense: numberField("defense"),
        }),
        tool: objectField("", {
          kind: stringField("kind", { const: "tool" }),
          power: numberField("power"),
        }),
      }),
      inlineRef: inlineOrReferenceField("inlineRef", objectField("", { title: stringField("title") })),
      payload: objectField("payload", {
        nested: stringField("nested"),
      }),
    });

    const documentJson = {
      name: "Armor Bronze Hands",
      details: {
        tier: "bronze",
      },
      tags: ["armor", "bronze"],
      dimensions: [2, 4],
      labels: {
        slot: "Hands",
        rarity: "Common",
      },
      owner: {
        title: "Caretaker",
      },
      item: {
        kind: "armor",
        defense: 7,
      },
      inlineRef: {
        title: "Inline Value",
      },
      payload: {
        nested: "value",
      },
    };

    const root = parseUntilReady({
      text: JSON.stringify(documentJson),
      rootField,
      resolveRef: refId =>
        ({
          "owner#": objectField(null, {
            title: stringField("title"),
          }),
        })[refId] ?? null,
    });

    expect(normalizeRoundTripJson(serializeDocument(root))).toEqual(normalizeRoundTripJson(documentJson));
  });

  test("treats empty composites and null inline refs the same as missing", () => {
    const rootField = objectField(null, {
      meta: objectField("meta", {}),
      tags: arrayField("tags", stringField("tag")),
      dimensions: arrayField("dimensions", [numberField("x"), numberField("y")]),
      labels: mapField("labels", stringField("label")),
      inlineRef: inlineOrReferenceField("inlineRef", objectField("", { title: stringField("title") })),
    });

    const documentJson = {
      meta: {},
      tags: [],
      dimensions: [],
      labels: {},
      inlineRef: null,
    };

    const root = parseUntilReady({
      text: JSON.stringify(documentJson),
      rootField,
    });

    expect(normalizeRoundTripJson(serializeDocument(root))).toEqual(normalizeRoundTripJson({}));
  });

  if (process.env[BASE_GAME_ASSETS_DIR_ENV]) {
    test(
      "round-trips supported BaseGame assets",
      () => {
        const scriptPath = path.resolve(process.cwd(), "test/asset-editor-parser/baseGameRoundTrip.mjs");
        const result = spawnSync(process.execPath, ["--experimental-strip-types", scriptPath], {
          cwd: process.cwd(),
          env: process.env,
          encoding: "utf8",
          maxBuffer: 1024 * 1024 * 32,
        });

        expect(result.status, [result.stdout, result.stderr].filter(Boolean).join("\n\n")).toBe(0);
      },
      300_000,
    );
  }
});
