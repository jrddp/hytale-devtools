import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { serialize as v8Serialize } from "node:v8";

import { SchemaRuntime } from "../src/schema/schemaLoader";
import type { AssetDefinition } from "../src/shared/fieldTypes";
import type { RootFieldInstance } from "../webview/hytale-asset-editor/src/parsing/fieldInstances";
import { parseDocumentText } from "../webview/hytale-asset-editor/src/parsing/parseDocument";

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

    if (stats.isFile() && fullPath.endsWith(".json")) {
      files.push(fullPath);
    }
  }

  return files;
}

function toPosixRelativePath(rootDir: string, targetPath: string): string {
  return path.relative(rootDir, targetPath).split(path.sep).join("/");
}

function formatMegabytes(byteSize: number): string {
  return `${(byteSize / (1024 * 1024)).toFixed(2)} MB`;
}

function formatPerTypeLine({
  assetType,
  count,
  v8ByteSize,
  jsonByteSize,
}: {
  assetType: string;
  count: number;
  v8ByteSize: number;
  jsonByteSize: number;
}): string {
  return [
    `${assetType}`,
    `count=${count}`,
    `v8=${formatMegabytes(v8ByteSize)}`,
    `json=${formatMegabytes(jsonByteSize)}`,
  ].join(" | ");
}

function main(): void {
  const baseGameAssetsDir = process.argv[2] ?? process.env[BASE_GAME_ASSETS_DIR_ENV];
  if (!baseGameAssetsDir) {
    throw new Error(
      `Missing BaseGame asset root. Set ${BASE_GAME_ASSETS_DIR_ENV} in .env or pass it as the first argument.`,
    );
  }

  const normalizedBaseGameRoot = path.resolve(baseGameAssetsDir);
  const normalizedAssetsRoot = path.resolve(normalizedBaseGameRoot, "Server");
  if (!existsSync(normalizedAssetsRoot)) {
    throw new Error(`BaseGame Server directory not found: ${normalizedAssetsRoot}`);
  }

  const schemaRuntime = new SchemaRuntime(schemaDir, console);
  const assetsByRef = Object.fromEntries(schemaRuntime.assetsByRef);
  const supportedAssetPaths = walkJsonFiles(normalizedAssetsRoot).filter(assetPath =>
    schemaRuntime.getAssetDefinitionForPath(toPosixRelativePath(normalizedBaseGameRoot, assetPath)),
  );

  if (supportedAssetPaths.length === 0) {
    throw new Error(`No supported asset-editor files found under ${normalizedAssetsRoot}`);
  }

  const parsedAssetsByPath: Record<string, RootFieldInstance> = {};
  const parsedAssetsByType: Record<string, Record<string, RootFieldInstance>> = {};
  const failures: string[] = [];

  for (const assetPath of supportedAssetPaths) {
    const serverRelativePath = toPosixRelativePath(normalizedBaseGameRoot, assetPath);
    const assetDefinition = schemaRuntime.getAssetDefinitionForPath(serverRelativePath);
    if (!assetDefinition) {
      continue;
    }

    const text = readFileSync(assetPath, "utf8");
    let result;
    try {
      result = parseDocumentText({
        text,
        assetDefinition,
        assetsByRef,
      });
    } catch (error) {
      failures.push(
        `${assetPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    if (result.status !== "ready") {
      failures.push(`${assetPath}: ${result.error}`);
      continue;
    }

    parsedAssetsByPath[serverRelativePath] = result.rootField;
    const assetType = assetDefinition.path ?? "(unknown)";
    parsedAssetsByType[assetType] ??= {};
    parsedAssetsByType[assetType][serverRelativePath] = result.rootField;
  }

  if (Object.keys(parsedAssetsByPath).length === 0) {
    const preview = failures.slice(0, 20).join("\n");
    const remainder = failures.length > 20 ? `\n...and ${failures.length - 20} more` : "";
    throw new Error(
      `No supported assets were parsed successfully.${failures.length > 0 ? `\n${preview}${remainder}` : ""}`,
    );
  }

  const v8ByteSize = v8Serialize(parsedAssetsByPath).byteLength;
  const jsonByteSize = Buffer.byteLength(JSON.stringify(parsedAssetsByPath), "utf8");

  console.log(`Parsed assets: ${supportedAssetPaths.length}`);
  console.log(`Index entries: ${Object.keys(parsedAssetsByPath).length}`);
  console.log(`V8 serialized size: ${formatMegabytes(v8ByteSize)} (${v8ByteSize} bytes)`);
  console.log(`JSON size: ${formatMegabytes(jsonByteSize)} (${jsonByteSize} bytes)`);

  const perTypeSummaries = Object.entries(parsedAssetsByType)
    .map(([assetType, entries]) => {
      const typeV8ByteSize = v8Serialize(entries).byteLength;
      const typeJsonByteSize = Buffer.byteLength(JSON.stringify(entries), "utf8");
      return {
        assetType,
        count: Object.keys(entries).length,
        v8ByteSize: typeV8ByteSize,
        jsonByteSize: typeJsonByteSize,
      };
    })
    .sort((left, right) => right.v8ByteSize - left.v8ByteSize);

  console.log("Largest asset types by V8 serialized size:");
  for (const summary of perTypeSummaries.slice(0, 25)) {
    console.log(`- ${formatPerTypeLine(summary)}`);
  }

  if (failures.length > 0) {
    console.log(`Failed to parse: ${failures.length}`);
  }
}

main();
