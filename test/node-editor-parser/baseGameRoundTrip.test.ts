import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, test } from "vitest";

import {
  NODE_EDITOR_WORKSPACE_PATH_RULES,
  WorkspaceRuntime,
} from "../../src/node-editor/workspaceResolver";
import { SchemaRuntime } from "../../src/schema/schemaLoader";
import { parseDocumentText } from "../../webview/hytale-node-editor/src/node-editor/parsing/parseDocument.svelte";
import { serializeWorkspaceState } from "../../webview/hytale-node-editor/src/node-editor/parsing/serializeDocument";
import {
  areSemanticallyEquivalentValues,
  formatSemanticDiff,
  normalizeRoundTripJson,
  normalizeWorkspaceStateForSemanticComparison,
} from "./helpers";

const BASE_GAME_ASSETS_DIR_ENV = "BASE_GAME_ASSETS_DIR";
const schemaDir = path.resolve(process.cwd(), "default-data/export-data/schemas");
const workspacesRootPath = path.resolve(process.cwd(), "default-data/node-editor-workspace-definitions");

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

function collectNodeEditorCandidatePaths(serverRootPath: string): string[] {
  const candidatePaths = new Set<string>();

  for (const subpath of Object.keys(NODE_EDITOR_WORKSPACE_PATH_RULES)) {
    const relativeDirectory = subpath.replace(/^\/+|\/+$/g, "");
    const absoluteDirectory = path.join(path.dirname(serverRootPath), relativeDirectory);
    if (!existsSync(absoluteDirectory)) {
      continue;
    }

    for (const filePath of walkJsonFiles(absoluteDirectory)) {
      candidatePaths.add(filePath);
    }
  }

  return [...candidatePaths].sort((left, right) => left.localeCompare(right));
}

describe("node editor BaseGame round-trip", () => {
  const baseGameAssetsDir = process.env[BASE_GAME_ASSETS_DIR_ENV];

  test.skipIf(!baseGameAssetsDir)(
    "round-trips supported BaseGame node-editor assets",
    async () => {
      const normalizedAssetsRoot = path.resolve(baseGameAssetsDir!, "Server");
      if (!existsSync(normalizedAssetsRoot)) {
        throw new Error(`BaseGame Server directory not found: ${normalizedAssetsRoot}`);
      }

      const logger = {
        error() {},
        warn() {},
        info() {},
        debug() {},
      };
      const schemaRuntime = new SchemaRuntime(schemaDir, logger);
      const workspaceRuntime = new WorkspaceRuntime(workspacesRootPath, schemaRuntime, logger);

      const supportedAssetPaths = collectNodeEditorCandidatePaths(normalizedAssetsRoot).filter(
        assetPath => workspaceRuntime.resolveWorkspaceContext(assetPath),
      );

      if (supportedAssetPaths.length === 0) {
        throw new Error(`No supported node-editor files found under ${normalizedAssetsRoot}`);
      }

      const failures: string[] = [];

      for (const [index, assetPath] of supportedAssetPaths.entries()) {
        if (index % 100 === 0) {
          console.log(
            `[node-editor round-trip] ${index + 1}/${supportedAssetPaths.length}: ${path.relative(
              normalizedAssetsRoot,
              assetPath,
            )}`,
          );
        }

        try {
          const workspaceContext = workspaceRuntime.resolveWorkspaceContext(assetPath);
          if (!workspaceContext) {
            continue;
          }

          const originalJson = JSON.parse(readFileSync(assetPath, "utf8")) as Record<string, unknown>;
          const parsed = parseDocumentText(JSON.stringify(originalJson), workspaceContext);
          const serializedJson = serializeWorkspaceState(parsed, workspaceContext.rootMenuName);
          const reparsed = parseDocumentText(
            JSON.stringify(normalizeRoundTripJson(serializedJson)),
            workspaceContext,
          );
          const actual = normalizeWorkspaceStateForSemanticComparison(reparsed);
          const expected = normalizeWorkspaceStateForSemanticComparison(parsed);

          if (!areSemanticallyEquivalentValues(expected, actual)) {
            throw new Error(formatSemanticDiff(expected, actual));
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
