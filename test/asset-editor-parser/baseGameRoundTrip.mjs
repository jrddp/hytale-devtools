import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build as buildWithEsbuild } from "esbuild";

const BASE_GAME_ASSETS_DIR_ENV = "BASE_GAME_ASSETS_DIR";
const schemaDir = path.resolve(process.cwd(), "default-data/export-data/schemas");
const runtimeBundlePath = path.join(
  "/tmp",
  `hytale-asset-editor-schema-runtime-roundtrip-${process.pid}.mjs`,
);

globalThis.$state = {
  snapshot: value => value,
};

const { parseDocumentText } = await import(
  pathToFileURL(path.resolve("webview/hytale-asset-editor/src/parsing/parseDocument.svelte.ts")).href
);
const { serializeDocument } = await import(
  pathToFileURL(path.resolve("webview/hytale-asset-editor/src/parsing/serializeDocument.ts")).href
);

function loadDotEnv(envPath) {
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

function walkJsonFiles(dirPath) {
  const files = [];

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

function parseJsonText(text) {
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

function canonicalizeJson(value) {
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

function parseUntilReady({ text, rootField, resolveRef = () => null }) {
  const resolvedRefsByRef = new Map();

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

async function createSchemaRuntime() {
  console.log("[asset-editor round-trip] bundling schema runtime");
  await buildWithEsbuild({
    entryPoints: [path.resolve(process.cwd(), "src/schema/schemaLoader.ts")],
    outfile: runtimeBundlePath,
    bundle: true,
    format: "esm",
    platform: "node",
    sourcemap: false,
    logLevel: "silent",
  });
  console.log("[asset-editor round-trip] bundled schema runtime");

  const runtimeModule = await import(`${pathToFileURL(runtimeBundlePath).href}?t=${Date.now()}`);
  console.log("[asset-editor round-trip] imported bundled schema runtime");
  return new runtimeModule.SchemaRuntime(schemaDir, console);
}

loadDotEnv(path.resolve(process.cwd(), ".env"));

const baseGameAssetsDir = process.env[BASE_GAME_ASSETS_DIR_ENV];
if (!baseGameAssetsDir) {
  console.error(`Missing ${BASE_GAME_ASSETS_DIR_ENV}.`);
  process.exit(1);
}

const normalizedAssetsRoot = path.resolve(baseGameAssetsDir, "Server");
if (!existsSync(normalizedAssetsRoot)) {
  console.error(`BaseGame Server directory not found: ${normalizedAssetsRoot}`);
  process.exit(1);
}

console.log("[asset-editor round-trip] creating schema runtime");
const schemaRuntime = await createSchemaRuntime();
console.log("[asset-editor round-trip] schema runtime ready");
const supportedAssetPaths = walkJsonFiles(normalizedAssetsRoot).filter(assetPath =>
  schemaRuntime.getAssetDefinitionForPath(assetPath),
);

if (supportedAssetPaths.length === 0) {
  console.error(`No supported asset-editor files found under ${normalizedAssetsRoot}`);
  process.exit(1);
}

console.log(
  `[asset-editor round-trip] checking ${supportedAssetPaths.length} supported assets under ${normalizedAssetsRoot}`,
);

const failures = [];

for (const [index, assetPath] of supportedAssetPaths.entries()) {
  if (index % 100 === 0) {
    console.log(
      `[asset-editor round-trip] ${index + 1}/${supportedAssetPaths.length}: ${path.relative(normalizedAssetsRoot, assetPath)}`,
    );
  }

  const assetDefinition = schemaRuntime.getAssetDefinitionForPath(assetPath);
  if (!assetDefinition) {
    continue;
  }

  try {
    const originalJson = parseJsonText(readFileSync(assetPath, "utf8"));
    const rootField = parseUntilReady({
      text: JSON.stringify(originalJson),
      rootField: assetDefinition.rootField,
      resolveRef: refId => schemaRuntime.assetsByRef.get(refId)?.rootField ?? null,
    });

    assert.deepStrictEqual(
      canonicalizeJson(serializeDocument(rootField)),
      canonicalizeJson(originalJson),
    );
  } catch (error) {
    failures.push(`${assetPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.error(failures.slice(0, 20).join("\n"));
  if (failures.length > 20) {
    console.error(`...and ${failures.length - 20} more failures`);
  }
  process.exit(1);
}

console.log(`[asset-editor round-trip] passed ${supportedAssetPaths.length} supported assets`);
