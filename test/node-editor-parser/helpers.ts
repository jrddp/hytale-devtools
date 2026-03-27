import type { AssetDocumentShape } from "@shared/node-editor/assetTypes";
import type {
  FieldComponentType,
  NodeEditorWorkspaceContext,
  NodeField,
  NodePin,
  NodeTemplate,
  VariantKindDefinition,
} from "@shared/node-editor/workspaceTypes";
import type { FlowEdge, FlowNode } from "src/common";
import { parseDocument } from "src/node-editor/parsing/parseDocument.svelte";
import { serializeWorkspaceState } from "src/node-editor/parsing/serializeDocument";
import type { WorkspaceState } from "src/workspace.svelte";

const UUID_SUFFIX_RE =
  /^(.*)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function nodeField(
  schemaKey: string,
  type: FieldComponentType = "string",
  overrides: Partial<NodeField> = {},
): NodeField {
  return {
    schemaKey,
    localId: schemaKey,
    type,
    ...overrides,
  };
}

export function outputPin(
  schemaKey: string,
  multiplicity: NodePin["multiplicity"] = "single",
  overrides: Partial<NodePin> = {},
): NodePin {
  return {
    schemaKey,
    localId: schemaKey,
    multiplicity,
    ...overrides,
  };
}

export function inputPin(
  schemaKey: string = "input",
  multiplicity: NodePin["multiplicity"] = "single",
  overrides: Partial<NodePin> = {},
): NodePin {
  return {
    schemaKey,
    localId: schemaKey,
    multiplicity,
    ...overrides,
  };
}

export function nodeTemplate(
  templateId: string,
  overrides: Partial<NodeTemplate> = {},
): NodeTemplate {
  return {
    templateId,
    defaultTitle: templateId,
    childTypes: {},
    fieldsBySchemaKey: {},
    inputPins: [],
    outputPins: [],
    schemaConstants: {},
    ...overrides,
  };
}

export function workspaceContext({
  rootTemplateOrVariantId = "Root",
  rootMenuName = "Test Workspace",
  templates,
  templateCategories,
  variantKindsById = {},
}: {
  rootTemplateOrVariantId?: string;
  rootMenuName?: string;
  templates: NodeTemplate[];
  templateCategories?: Record<string, string[]>;
  variantKindsById?: Record<string, VariantKindDefinition>;
}): NodeEditorWorkspaceContext {
  const nodeTemplatesById = Object.fromEntries(templates.map(template => [template.templateId, template]));
  return {
    rootTemplateOrVariantId,
    rootMenuName,
    nodeTemplatesById,
    templateCategories:
      templateCategories ?? {
        General: templates.map(template => template.templateId),
      },
    variantKindsById,
  };
}

export function parseWorkspaceDocument(
  document: AssetDocumentShape,
  context: NodeEditorWorkspaceContext,
): WorkspaceState {
  return parseDocument(document, context);
}

export function serializeWorkspace(
  state: WorkspaceState,
  workspaceId?: string,
): AssetDocumentShape {
  return serializeWorkspaceState(state, workspaceId);
}

export function findNode(state: WorkspaceState, nodeId: string): FlowNode {
  const node = state.nodes.find(candidate => candidate.id === nodeId);
  if (!node) {
    throw new Error(`Expected node ${nodeId} to exist.`);
  }
  return node;
}

export function findNodeByBaseId(state: WorkspaceState, baseId: string): FlowNode {
  const node = state.nodes.find(candidate => {
    if (candidate.id === baseId) {
      return true;
    }

    const match = candidate.id.match(UUID_SUFFIX_RE);
    return match?.[1] === baseId;
  });

  if (!node) {
    throw new Error(`Expected node with base id ${baseId} to exist.`);
  }

  return node;
}

export function expectCanonicalizedNodeId(nodeId: string, baseId: string): void {
  const match = nodeId.match(UUID_SUFFIX_RE);
  if (!match || match[1] !== baseId) {
    throw new Error(`Expected ${nodeId} to have canonical base id ${baseId}.`);
  }
}

export function findEdge(state: WorkspaceState, edgeId: string): FlowEdge {
  const edge = state.edges.find(candidate => candidate.id === edgeId);
  if (!edge) {
    throw new Error(`Expected edge ${edgeId} to exist.`);
  }
  return edge;
}

export function normalizeRoundTripJson(value: unknown, isRoot = true): unknown {
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

const SEMANTIC_NODE_TYPES = new Set(["datanode", "rawjson"]);

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

export function normalizeWorkspaceStateForSemanticComparison(state: WorkspaceState): Record<string, unknown> {
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

  const normalizedRootNodeId = state.rootNodeId && semanticNodeIdSet.has(state.rootNodeId)
    ? state.rootNodeId
    : null;

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

export function areSemanticallyEquivalentValues(expected: unknown, actual: unknown): boolean {
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

export function formatSemanticDiff(expected: unknown, actual: unknown): string {
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
