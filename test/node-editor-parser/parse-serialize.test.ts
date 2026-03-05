import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { type FlowEdge, type FlowNode } from "src/common";
import { parseDocumentText } from "src/node-editor/parsing/parseDocument.svelte";
import { serializeDocument } from "src/node-editor/parsing/serializeDocument";
import { workspace } from "src/workspace.svelte";

import {
  loadHytaleGeneratorBiomeWorkspaceContext,
  loadNodeEditorWorkspacesForTests,
  resolveWorkspaceContextForAssetPath,
} from "./hytaleGeneratorBiomeContext";

const TARGET_ASSET_DIRECTORIES = [
  "Reference/BaseGameAssets/Server/HytaleGenerator",
  "Reference/BaseGameAssets/Server/ScriptedBrushes",
];

const SEMANTIC_NODE_TYPES = new Set(["datanode", "rawjson"]);
const REPORT_OUTPUT_DIRECTORY = "test-results";
const REPORT_OUTPUT_FILENAME = "node-editor-roundtrip-report.txt";

function parseJsonText(text: string): unknown {
  const normalizedText = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return JSON.parse(normalizedText);
}

async function collectJsonFilesRecursively(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const filePaths: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      filePaths.push(...(await collectJsonFilesRecursively(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      filePaths.push(fullPath);
    }
  }

  return filePaths;
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, nestedValue]) => [key, sortDeep(nestedValue)]),
    );
  }

  return value;
}

function normalizeEdge(edge: FlowEdge): Record<string, unknown> {
  return {
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
  };
}

function normalizeNode(node: FlowNode): Record<string, unknown> {
  if (node.type === "rawjson") {
    return {
      id: node.id,
      type: node.type,
      payload: JSON.parse(node.data.jsonString),
    };
  }

  const fieldValuesBySchemaKey: Record<string, unknown> = {};
  for (const [schemaKey, field] of Object.entries(node.data.fieldsBySchemaKey ?? {})) {
    fieldValuesBySchemaKey[schemaKey] = field.value;
  }

  return {
    id: node.id,
    type: node.type,
    templateId: node.data.templateId,
    childTypes: node.data.childTypes ?? {},
    schemaConstants: node.data.schemaConstants ?? {},
    unparsedMetadata: node.data.unparsedMetadata ?? {},
    fieldValuesBySchemaKey,
  };
}

function normalizeWorkspaceStateForSemanticComparison(state: {
  rootNodeId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}): Record<string, unknown> {
  const semanticNodes = state.nodes.filter((node) => SEMANTIC_NODE_TYPES.has(node.type));
  const semanticNodeIdSet = new Set(semanticNodes.map((node) => node.id));

  const normalizedNodes = semanticNodes
    .map((node) => normalizeNode(node))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

  const normalizedEdges = state.edges
    .filter((edge) => semanticNodeIdSet.has(edge.source) && semanticNodeIdSet.has(edge.target))
    .map((edge) => normalizeEdge(edge))
    .sort((left, right) => {
      const leftKey = `${left.source}:${left.sourceHandle}->${left.target}`;
      const rightKey = `${right.source}:${right.sourceHandle}->${right.target}`;
      return leftKey.localeCompare(rightKey);
    });

  const normalizedRootNodeId = semanticNodeIdSet.has(state.rootNodeId) ? state.rootNodeId : null;

  return sortDeep({
    rootNodeId: normalizedRootNodeId,
    nodes: normalizedNodes,
    edges: normalizedEdges,
  }) as Record<string, unknown>;
}

type SemanticDiffEntry = {
  path: string;
  expected: unknown;
  actual: unknown;
};

function areSemanticallyEquivalentPrimitiveValues(expected: unknown, actual: unknown): boolean {
  if (expected === "" && actual === undefined) {
    return true;
  }
  if (expected === undefined && actual === "") {
    return true;
  }
  return Object.is(expected, actual);
}

function areSemanticallyEquivalentValues(expected: unknown, actual: unknown): boolean {
  if (areSemanticallyEquivalentPrimitiveValues(expected, actual)) {
    return true;
  }

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return false;
    }
    if (expected.length !== actual.length) {
      return false;
    }
    for (let index = 0; index < expected.length; index++) {
      if (!areSemanticallyEquivalentValues(expected[index], actual[index])) {
        return false;
      }
    }
    return true;
  }

  const expectedIsObject = expected !== null && typeof expected === "object";
  const actualIsObject = actual !== null && typeof actual === "object";
  if (expectedIsObject || actualIsObject) {
    if (!expectedIsObject || !actualIsObject) {
      return false;
    }

    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    const keys = new Set([...Object.keys(expectedRecord), ...Object.keys(actualRecord)]);
    for (const key of keys) {
      if (!areSemanticallyEquivalentValues(expectedRecord[key], actualRecord[key])) {
        return false;
      }
    }
    return true;
  }

  return false;
}

function collectSemanticDiffEntries(
  expected: unknown,
  actual: unknown,
  path: string,
  entries: SemanticDiffEntry[],
  maxEntries: number,
): void {
  if (entries.length >= maxEntries) {
    return;
  }

  if (areSemanticallyEquivalentPrimitiveValues(expected, actual)) {
    return;
  }

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      entries.push({ path, expected, actual });
      return;
    }

    if (expected.length !== actual.length) {
      entries.push({
        path: `${path}.length`,
        expected: expected.length,
        actual: actual.length,
      });
    }

    const minLength = Math.min(expected.length, actual.length);
    for (let index = 0; index < minLength; index++) {
      collectSemanticDiffEntries(
        expected[index],
        actual[index],
        `${path}[${index}]`,
        entries,
        maxEntries,
      );
      if (entries.length >= maxEntries) {
        return;
      }
    }
    return;
  }

  const expectedIsObject = expected !== null && typeof expected === "object";
  const actualIsObject = actual !== null && typeof actual === "object";
  if (expectedIsObject || actualIsObject) {
    if (!expectedIsObject || !actualIsObject) {
      entries.push({ path, expected, actual });
      return;
    }

    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(expectedRecord), ...Object.keys(actualRecord)])).sort();

    for (const key of keys) {
      collectSemanticDiffEntries(
        expectedRecord[key],
        actualRecord[key],
        `${path}.${key}`,
        entries,
        maxEntries,
      );
      if (entries.length >= maxEntries) {
        return;
      }
    }
    return;
  }

  entries.push({ path, expected, actual });
}

function toSingleLineJson(value: unknown, maxLength: number = 220): string {
  let text: string;
  try {
    const serialized = JSON.stringify(value);
    text = serialized === undefined ? String(value) : serialized;
  } catch {
    text = String(value);
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function formatSemanticDiff(expected: unknown, actual: unknown): string {
  const maxDiffEntries = 12;
  const entries: SemanticDiffEntry[] = [];
  collectSemanticDiffEntries(expected, actual, "$", entries, maxDiffEntries);

  if (entries.length === 0) {
    return "no diff entries found";
  }

  const lines = entries.map((entry) => {
    return `${entry.path}\n  expected: ${toSingleLineJson(entry.expected)}\n  actual:   ${toSingleLineJson(entry.actual)}`;
  });

  return lines.join("\n");
}

describe("node editor parser", () => {
  test("parseDocumentText parses Ref/SampleJson/Basic.json", async () => {
    const repoRootPath = process.cwd();
    const workspaceContext = await loadHytaleGeneratorBiomeWorkspaceContext(repoRootPath);
    const basicJsonText = await readFile(
      path.join(repoRootPath, "Ref", "SampleJson", "Basic.json"),
      "utf8",
    );

    const parsed = parseDocumentText(basicJsonText, workspaceContext);

    expect(parsed.rootNodeId.startsWith("Biome-")).toBe(true);
    expect(parsed.nodes.length).toBeGreaterThan(0);
    expect(parsed.edges.length).toBeGreaterThan(0);
  });

  test(
    "roundtrips all base assets in HytaleGenerator + ScriptedBrushes with semantic equality",
    async () => {
      const repoRootPath = process.cwd();
      const workspacesByName = await loadNodeEditorWorkspacesForTests(repoRootPath);

      const assetPaths = (
        await Promise.all(
          TARGET_ASSET_DIRECTORIES.map((directory) =>
            collectJsonFilesRecursively(path.join(repoRootPath, directory)),
          ),
        )
      )
        .flat()
        .sort((leftPath, rightPath) => leftPath.localeCompare(rightPath));

      const failures: string[] = [];
      const originalWarn = console.warn;
      console.warn = () => {};

      try {
        for (const assetPath of assetPaths) {
          const relativeAssetPath = path.relative(repoRootPath, assetPath);

          let inputText: string;
          let inputJson: Record<string, unknown>;
          try {
            inputText = await readFile(assetPath, "utf8");
            inputJson = parseJsonText(inputText) as Record<string, unknown>;
          } catch (error) {
            failures.push(`${relativeAssetPath}: failed to read/parse JSON (${String(error)})`);
            continue;
          }

          const workspaceContext = resolveWorkspaceContextForAssetPath(
            assetPath,
            workspacesByName,
            inputJson,
          );

          if (!workspaceContext) {
            failures.push(`${relativeAssetPath}: failed to resolve workspace context`);
            continue;
          }

          try {
            const parsedInput = parseDocumentText(inputText, workspaceContext);

            workspace.context = workspaceContext;
            workspace.nodes = parsedInput.nodes;
            workspace.edges = parsedInput.edges;
            workspace.rootNodeId = parsedInput.rootNodeId;

            const serialized = serializeDocument();
            const reparsed = parseDocumentText(JSON.stringify(serialized), workspaceContext);

            const normalizedParsedInput = normalizeWorkspaceStateForSemanticComparison(parsedInput);
            const normalizedReparsedOutput = normalizeWorkspaceStateForSemanticComparison(reparsed);

            if (!areSemanticallyEquivalentValues(normalizedParsedInput, normalizedReparsedOutput)) {
              failures.push(
                `${relativeAssetPath}: semantic mismatch after roundtrip\n${formatSemanticDiff(
                  normalizedParsedInput,
                  normalizedReparsedOutput,
                )}`,
              );
            }
          } catch (error) {
            failures.push(`${relativeAssetPath}: roundtrip threw (${String(error)})`);
          }
        }
      } finally {
        console.warn = originalWarn;
      }

      if (failures.length > 0) {
        const reportDirectoryPath = path.join(repoRootPath, REPORT_OUTPUT_DIRECTORY);
        const reportFilePath = path.join(reportDirectoryPath, REPORT_OUTPUT_FILENAME);
        const reportHeader = [
          "Node Editor Roundtrip Report",
          `Generated: ${new Date().toISOString()}`,
          `Assets scanned: ${assetPaths.length}`,
          `Failures: ${failures.length}`,
          "",
        ].join("\n");
        const reportBody = `${reportHeader}${failures.join("\n\n")}\n`;
        await mkdir(reportDirectoryPath, { recursive: true });
        await writeFile(reportFilePath, reportBody, "utf8");

        const preview = failures.slice(0, 25).join("\n");
        const extra = failures.length > 25 ? `\n... ${failures.length - 25} more` : "";
        throw new Error(
          `roundtrip failures (${failures.length}/${assetPaths.length} assets):\n${preview}${extra}\n\nfull report: ${path.relative(repoRootPath, reportFilePath)}`,
        );
      }

      expect(assetPaths.length).toBeGreaterThan(0);
    },
    300_000,
  );
});
