<script>
  import { onMount } from "svelte";
  import { SvelteFlowProvider } from "@xyflow/svelte";
  import Flow from "./Flow.svelte";
  import {
    COMMENT_NODE_TYPE,
    CUSTOM_NODE_TYPE,
    GROUP_NODE_TYPE,
    PAYLOAD_EDITOR_FIELDS_KEY,
    PAYLOAD_TEMPLATE_ID_KEY,
    RAW_JSON_INPUT_HANDLE_ID,
    RAW_JSON_NODE_TYPE,
  } from "./node-editor/types.js";
  import {
    NODE_EDITOR_METADATA_KEY,
    collectNodeIdsFromPayload,
    collectRuntimeNodePayloadById,
    defaultLabelForNodeId,
    isObject,
    normalizeHandleId,
    normalizeNodeId,
    normalizeNonEmptyString,
    normalizePosition,
    omitKeys,
    readRuntimeRootNodeId,
    readTypeFromNodeId,
    rewriteNodePayloadTree,
  } from "./node-editor/assetDocumentUtils.js";
  import {
    findTemplateByTypeName,
    findTemplatesByTypeName,
    getDefaultTemplate,
    getTemplateById,
    getWorkspaceDefinition,
    getTemplatesForNodeSelector,
    setActiveWorkspaceContext,
    setActiveTemplateSourceMode,
  } from "./node-editor/templateCatalog.js";
  import {
    applySchemaEdgesToNodePayloads,
    extractSchemaEdgesFromNodePayloads,
  } from "./node-editor/connectionSchemaMapper.js";
  import { layoutDirectedGraph } from "./node-editor/autoLayout.js";
  import {
    LEGACY_ROOT_EDITOR_KEYS,
    convertLegacyInlineAssetDocument,
    isLegacyInlineAssetDocument,
  } from "./node-editor/legacyAssetDocumentConverter.js";
  import {
    getWorkspaceVariantFieldNames,
    readPayloadVariantIdentity,
    resolveTemplateIdFromPayloadVariant,
    writeTemplateVariantIdentity,
  } from "./node-editor/variantIdentityResolver.js";
  import { resolveWorkspaceContext } from "./node-editor/workspaceContextResolver.js";
  import {
    COMMENT_DEFAULT_FONT_SIZE,
    COMMENT_DEFAULT_HEIGHT,
    COMMENT_DEFAULT_WIDTH,
    COMMENT_MIN_HEIGHT,
    COMMENT_MIN_WIDTH,
    normalizeCommentFontSize,
    normalizeCommentName,
    normalizeCommentText,
  } from "./node-editor/commentMetadata.js";

  export let vscode;
  export let templateSourceMode = "workspace-hg-java";

  const METADATA_RESERVED_KEYS = [
    "$WorkspaceID",
    "$Nodes",
    "$FloatingNodes",
    "$Links",
    "$Groups",
    "$Comments",
  ];
  const NODE_TEMPLATE_DATA_KEY = "$templateId";
  const NODE_FIELD_VALUES_DATA_KEY = "$fieldValues";
  const RAW_JSON_DATA_FIELD_ID = "Data";
  const RAW_JSON_DEFAULT_DATA_VALUE = "{\n\n}";
  const GROUP_NODE_ID_PREFIX = "__group__";
  const COMMENT_NODE_ID_PREFIX = "__comment__";
  const DEFAULT_GROUP_NAME = "Group";
  const DEFAULT_GROUP_WIDTH = 520;
  const DEFAULT_GROUP_HEIGHT = 320;
  const MIN_GROUP_WIDTH = 180;
  const MIN_GROUP_HEIGHT = 120;
  const GROUP_Z_INDEX_UNSELECTED = -10000;
  const GROUP_Z_INDEX_SELECTED = 10000;
  const GROUP_RESERVED_KEYS = ["$Position", "$width", "$height", "$name"];
  const COMMENT_RESERVED_KEYS = ["$Position", "$width", "$height", "$name", "$text", "$fontSize"];
  const LEGACY_MISSING_POSITION_LAYOUT_DIRECTION = "LR";
  const LEGACY_MISSING_POSITION_LAYOUT_NODE_SIZE = {
    width: 360,
    height: 240,
  };
  const BASE_TEMPLATE_RESOLUTION_EXCLUDED_KEYS = new Set([
    "$NodeId",
    "$Comment",
    PAYLOAD_TEMPLATE_ID_KEY,
    PAYLOAD_EDITOR_FIELDS_KEY,
  ]);

  setActiveTemplateSourceMode(templateSourceMode);
  $: setActiveTemplateSourceMode(templateSourceMode);

  let documentPath = "";
  const initialState = parseDocumentText("");

  let nodes = initialState.nodes;
  let edges = initialState.edges;
  let runtimeFields = initialState.runtimeFields;
  let metadataContext = initialState.metadataContext;
  let syncedText = initialState.serializedText;
  let sourceVersion = -1;
  let graphLoadVersion = 0;
  let extensionError = "";

  function handleMessage(event) {
    const message = event.data;
    if (!message || typeof message.type !== "string") {
      return;
    }

    if (message.type === "update") {
      sourceVersion = typeof message.version === "number" ? message.version : sourceVersion;
      const incomingText = typeof message.text === "string" ? message.text : "";
      documentPath =
        typeof message.documentPath === "string" ? message.documentPath : documentPath;

      try {
        const parsedState = parseDocumentText(incomingText, documentPath);
        nodes = parsedState.nodes;
        edges = parsedState.edges;
        runtimeFields = parsedState.runtimeFields;
        metadataContext = parsedState.metadataContext;
        syncedText = parsedState.serializedText;
        graphLoadVersion += 1;
        extensionError = "";
      } catch (error) {
        extensionError = error instanceof Error ? error.message : "Could not parse flow JSON.";
      }
      return;
    }

    if (message.type === "error") {
      extensionError =
        typeof message.message === "string" ? message.message : "Unknown editor error.";
    }
  }

  function handleFlowChange(event) {
    const detail = event.detail ?? {};
    applyFlowState(detail.nodes, detail.edges);
  }

  function applyFlowState(nextNodes, nextEdges) {
    const serialized = buildSerializedState({
      nodes: Array.isArray(nextNodes) ? nextNodes : [],
      edges: Array.isArray(nextEdges) ? nextEdges : [],
      runtimeFields,
      metadataContext,
    });

    if (serialized.text === syncedText) {
      return;
    }

    nodes = serialized.nodes;
    edges = serialized.edges;
    metadataContext = serialized.metadataContext;
    syncedText = serialized.text;
    setActiveWorkspaceContext(metadataContext?.workspaceContext);

    vscode.postMessage({
      type: "apply",
      text: serialized.text,
      sourceVersion,
    });
  }

  onMount(() => {
    window.addEventListener("message", handleMessage);
    vscode.postMessage({ type: "ready" });

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  });

  function parseDocumentText(text, sourceDocumentPath = documentPath) {
    if (!text.trim()) {
      return buildStateFromMetadataDocument({}, {}, sourceDocumentPath);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("The underlying file is not valid JSON.");
    }

    if (!isObject(parsed)) {
      throw new Error("The flow file must be a JSON object.");
    }

    const hasMetadataContainer = isObject(parsed[NODE_EDITOR_METADATA_KEY]);
    if (isLegacyInlineAssetDocument(parsed)) {
      const legacyRuntimeRoot = omitKeys(parsed, LEGACY_ROOT_EDITOR_KEYS);
      const legacyWorkspaceContext = resolveWorkspaceContext({
        documentPath: sourceDocumentPath,
        metadataWorkspaceId: parsed?.$WorkspaceID,
        runtimeRoot: legacyRuntimeRoot,
      });
      const convertedLegacy = convertLegacyInlineAssetDocument(parsed, {
        resolveNodeIdPrefix(params) {
          return resolveLegacyNodeIdPrefix({
            ...params,
            workspaceContext: legacyWorkspaceContext,
          });
        },
        shouldTreatAsLegacyNodePayload(params) {
          const workspaceDefinition = getWorkspaceDefinition(legacyWorkspaceContext);
          return Boolean(
            resolveTemplateIdFromPayloadVariant(params?.payload, workspaceDefinition, {
              nodeId: params?.payload?.$NodeId,
              includeNodeIdFallback: false,
            })?.templateId
          );
        },
      });
      return buildStateFromMetadataDocument(
        convertedLegacy.runtime,
        convertedLegacy.metadataRoot,
        sourceDocumentPath,
        {
          enableLegacyMissingPositionAutoLayout: true,
          legacyHasAnyExplicitRuntimePosition: convertedLegacy.hasAnyExplicitRuntimePosition,
        }
      );
    }

    const metadataRoot = hasMetadataContainer ? parsed[NODE_EDITOR_METADATA_KEY] : {};
    const runtime = hasMetadataContainer ? omitKeys(parsed, [NODE_EDITOR_METADATA_KEY]) : parsed;
    return buildStateFromMetadataDocument(runtime, metadataRoot, sourceDocumentPath);
  }

  function buildStateFromMetadataDocument(
    runtime,
    metadataRoot,
    sourceDocumentPath = documentPath,
    options = {}
  ) {
    const workspaceContext = resolveWorkspaceContext({
      documentPath: sourceDocumentPath,
      metadataWorkspaceId: metadataRoot?.$WorkspaceID,
      runtimeRoot: runtime,
    });
    setActiveWorkspaceContext(workspaceContext);

    const runtimeNodePayloadById = collectRuntimeNodePayloadById(runtime);
    const runtimeTreeNodeIds = new Set(Object.keys(runtimeNodePayloadById));
    const context = parseMetadataContext(
      metadataRoot,
      runtimeNodePayloadById,
      runtimeTreeNodeIds,
      readRuntimeRootNodeId(runtime),
      workspaceContext
    );
    const shouldAutoLayoutLegacyMissingPositions =
      shouldApplyLegacyMissingPositionAutoLayout(options);
    let flowState = buildFlowStateFromMetadata(context, {
      applyAutoLayout: shouldAutoLayoutLegacyMissingPositions,
    });

    if (countRuntimeFlowNodes(flowState.nodes) === 0) {
      flowState = buildFlowStateFromMetadata(createMetadataContextWithDefaultNode(context));
    }

    const serialized = buildSerializedState({
      nodes: flowState.nodes,
      edges: flowState.edges,
      runtimeFields: runtime,
      metadataContext: context,
    });

    return {
      nodes: serialized.nodes,
      edges: serialized.edges,
      runtimeFields: runtime,
      metadataContext: serialized.metadataContext,
      serializedText: serialized.text,
    };
  }

  function getWorkspaceDefinitionForContext(context = metadataContext) {
    return getWorkspaceDefinition(context?.workspaceContext);
  }

  function buildTemplateResolutionExcludedPayloadKeys(context = metadataContext) {
    const excludedKeys = new Set(BASE_TEMPLATE_RESOLUTION_EXCLUDED_KEYS);
    const workspaceDefinition = getWorkspaceDefinitionForContext(context);
    const variantFieldNames = getWorkspaceVariantFieldNames(workspaceDefinition);
    for (const fieldName of variantFieldNames) {
      excludedKeys.add(fieldName);
    }
    return excludedKeys;
  }

  function applyTemplateVariantIdentityToPayload(
    payload,
    templateId,
    context = metadataContext
  ) {
    if (!isObject(payload)) {
      return;
    }

    const normalizedTemplateId = normalizeNonEmptyString(templateId);
    if (!normalizedTemplateId) {
      return;
    }

    const workspaceContext = context?.workspaceContext;
    const template = getTemplateById(normalizedTemplateId, workspaceContext);
    if (!template) {
      return;
    }

    const workspaceDefinition = getWorkspaceDefinition(workspaceContext);
    writeTemplateVariantIdentity(payload, template, workspaceDefinition);
  }

  function createMetadataContextWithDefaultNode(context) {
    const nextContext = {
      ...context,
      nodeMetadataById: { ...context.nodeMetadataById },
      nodePayloadById: { ...context.nodePayloadById },
    };

    const fallbackNode = createDefaultFlowNode(context);
    nextContext.nodeMetadataById[fallbackNode.id] = {
      $Position: {
        $x: fallbackNode.position.x,
        $y: fallbackNode.position.y,
      },
    };
    const fallbackPayload = {
      $NodeId: fallbackNode.id,
    };
    applyTemplateVariantIdentityToPayload(
      fallbackPayload,
      fallbackNode?.data?.[NODE_TEMPLATE_DATA_KEY],
      context
    );
    nextContext.nodePayloadById[fallbackNode.id] = fallbackPayload;
    if (!nextContext.rootNodeId) {
      nextContext.rootNodeId = fallbackNode.id;
    }

    return nextContext;
  }

  function shouldApplyLegacyMissingPositionAutoLayout(options = {}) {
    if (options?.enableLegacyMissingPositionAutoLayout !== true) {
      return false;
    }

    return options?.legacyHasAnyExplicitRuntimePosition !== true;
  }

  function buildFlowStateFromMetadata(context, options = {}) {
    const nodeIds = new Set([
      ...Object.keys(context.nodeMetadataById),
      ...Object.keys(context.nodePayloadById),
    ]);

    const parsedEdges = extractSchemaEdgesFromNodePayloads({
      nodePayloadById: context.nodePayloadById,
      resolveTemplateByNodeId(nodeId, payload) {
        return resolveTemplateForConnectionPayload(nodeId, payload, context);
      },
    });
    for (const parsedEdge of parsedEdges) {
      nodeIds.add(parsedEdge.source);
      nodeIds.add(parsedEdge.target);
    }

    const runtimeFlowNodes = [];
    const rawRuntimeNodeIds = new Set();
    const sortedNodeIds = Array.from(nodeIds).sort();
    for (let index = 0; index < sortedNodeIds.length; index += 1) {
      const nodeId = sortedNodeIds[index];
      const nodeMeta = isObject(context.nodeMetadataById[nodeId])
        ? context.nodeMetadataById[nodeId]
        : {};
      const payload = isObject(context.nodePayloadById[nodeId])
        ? context.nodePayloadById[nodeId]
        : {};
      const payloadForTemplate = getPayloadForTemplateResolution(payload, nodeId, context);
      const position = normalizePosition(nodeMeta?.$Position, index);
      const templateId = readTemplateId(undefined, payloadForTemplate, context);
      const templateDefinition = resolveTemplateForPayload(
        payloadForTemplate,
        nodeId,
        context,
        templateId
      );
      const resolvedTemplateId = normalizeNonEmptyString(templateDefinition?.templateId);
      const label = readNodeLabel(
        nodeId,
        nodeMeta,
        undefined,
        payloadForTemplate,
        context,
        resolvedTemplateId
      );
      const comment =
        typeof payloadForTemplate.$Comment === "string" && payloadForTemplate.$Comment.trim()
          ? payloadForTemplate.$Comment.trim()
          : undefined;

      if (!templateDefinition) {
        rawRuntimeNodeIds.add(nodeId);
        runtimeFlowNodes.push({
          id: nodeId,
          type: RAW_JSON_NODE_TYPE,
          data: {
            label,
            [NODE_FIELD_VALUES_DATA_KEY]: {
              [RAW_JSON_DATA_FIELD_ID]: stringifyRawJsonPayloadBody(payloadForTemplate),
            },
            ...(comment !== undefined ? { $comment: comment } : {}),
          },
          position,
        });
        continue;
      }

      const fieldValues = readFieldValues(
        undefined,
        payloadForTemplate,
        resolvedTemplateId,
        context
      );

      runtimeFlowNodes.push({
        id: nodeId,
        type: CUSTOM_NODE_TYPE,
        data: {
          label,
          ...(resolvedTemplateId !== undefined
            ? { [NODE_TEMPLATE_DATA_KEY]: resolvedTemplateId }
            : {}),
          ...(fieldValues !== undefined ? { [NODE_FIELD_VALUES_DATA_KEY]: fieldValues } : {}),
          ...(comment !== undefined ? { $comment: comment } : {}),
        },
        position,
      });
    }

    const normalizedParsedEdges = parsedEdges.map((edge) => {
      const targetNodeId = normalizeNonEmptyString(edge?.target);
      if (
        targetNodeId &&
        rawRuntimeNodeIds.has(targetNodeId) &&
        !normalizeNonEmptyString(edge?.targetHandle)
      ) {
        return {
          ...edge,
          targetHandle: RAW_JSON_INPUT_HANDLE_ID,
        };
      }

      return edge;
    });

    const normalizedRuntimeFlowNodes =
      options?.applyAutoLayout === true
        ? applyLegacyMissingPositionAutoLayout(runtimeFlowNodes, normalizedParsedEdges)
        : runtimeFlowNodes;
    const groupFlowNodes = buildGroupFlowNodes(context.groups);
    const commentFlowNodes = buildCommentFlowNodes(context.comments);
    const groupedRuntimeNodes = assignNodesToGroups(normalizedRuntimeFlowNodes, groupFlowNodes);

    return {
      nodes: [...groupFlowNodes, ...commentFlowNodes, ...groupedRuntimeNodes],
      edges: normalizedParsedEdges,
    };
  }

  function applyLegacyMissingPositionAutoLayout(runtimeNodesCandidate, edgesCandidate) {
    const runtimeNodes = Array.isArray(runtimeNodesCandidate) ? runtimeNodesCandidate : [];
    if (runtimeNodes.length === 0) {
      return runtimeNodes;
    }

    const nodeById = new Map();
    for (const runtimeNode of runtimeNodes) {
      const nodeId = normalizeNonEmptyString(runtimeNode?.id);
      if (!nodeId || nodeById.has(nodeId)) {
        continue;
      }

      nodeById.set(nodeId, runtimeNode);
    }

    if (nodeById.size === 0) {
      return runtimeNodes;
    }

    const layoutEdges = [];
    const sourceEdges = Array.isArray(edgesCandidate) ? edgesCandidate : [];
    for (const edge of sourceEdges) {
      const sourceNodeId = normalizeNonEmptyString(edge?.source);
      const targetNodeId = normalizeNonEmptyString(edge?.target);
      if (
        !sourceNodeId ||
        !targetNodeId ||
        !nodeById.has(sourceNodeId) ||
        !nodeById.has(targetNodeId)
      ) {
        continue;
      }

      layoutEdges.push({
        source: sourceNodeId,
        target: targetNodeId,
      });
    }

    const layoutedPositionById = layoutDirectedGraph({
      nodeIds: Array.from(nodeById.keys()),
      edges: layoutEdges,
      direction: LEGACY_MISSING_POSITION_LAYOUT_DIRECTION,
      nodeSize: LEGACY_MISSING_POSITION_LAYOUT_NODE_SIZE,
    });

    return runtimeNodes.map((runtimeNode, index) => {
      const nodeId = normalizeNonEmptyString(runtimeNode?.id);
      const layoutedPosition = nodeId ? layoutedPositionById.get(nodeId) : undefined;
      const nextPosition =
        layoutedPosition ?? normalizePosition(runtimeNode?.position, index);

      return {
        ...runtimeNode,
        position: nextPosition,
      };
    });
  }

  function parseMetadataContext(
    metadataRoot,
    runtimeNodePayloadById = {},
    runtimeTreeNodeIds = new Set(),
    runtimeRootNodeId = undefined,
    workspaceContext = undefined
  ) {
    const context = createEmptyMetadataContext(workspaceContext);
    context.workspaceId =
      normalizeNonEmptyString(workspaceContext?.rootMenuName) ??
      (typeof metadataRoot.$WorkspaceID === "string" && metadataRoot.$WorkspaceID.trim()
        ? metadataRoot.$WorkspaceID
        : undefined);
    context.groups = Array.isArray(metadataRoot.$Groups)
      ? metadataRoot.$Groups.map((group) => (isObject(group) ? { ...group } : group))
      : [];
    context.comments = Array.isArray(metadataRoot.$Comments)
      ? metadataRoot.$Comments.map((comment) => (isObject(comment) ? { ...comment } : comment))
      : [];
    context.floatingNodes = Array.isArray(metadataRoot.$FloatingNodes) ? metadataRoot.$FloatingNodes : [];
    context.metadataExtraFields = omitKeys(metadataRoot, METADATA_RESERVED_KEYS);
    context.nodePayloadById = { ...runtimeNodePayloadById };
    context.runtimeTreeNodeIds = runtimeTreeNodeIds;
    context.rootNodeId = runtimeRootNodeId;

    const nodesRoot = isObject(metadataRoot.$Nodes) ? metadataRoot.$Nodes : {};
    for (const [nodeId, nodeMeta] of Object.entries(nodesRoot)) {
      if (typeof nodeId !== "string" || !nodeId || !isObject(nodeMeta)) {
        continue;
      }
      context.nodeMetadataById[nodeId] = { ...nodeMeta };
    }

    for (const payload of context.floatingNodes) {
      if (!isObject(payload) || typeof payload.$NodeId !== "string" || !payload.$NodeId) {
        continue;
      }
      context.nodePayloadById[payload.$NodeId] = {
        ...(isObject(context.nodePayloadById[payload.$NodeId])
          ? context.nodePayloadById[payload.$NodeId]
          : {}),
        ...payload,
      };
    }

    context.linkById = isObject(metadataRoot.$Links) ? { ...metadataRoot.$Links } : {};

    if (!context.rootNodeId) {
      const rootMetadataNodeId = Object.entries(context.nodeMetadataById).find(
        ([, nodeMeta]) =>
          typeof nodeMeta?.$Title === "string" && nodeMeta.$Title.trim().startsWith("[ROOT]")
      )?.[0];
      if (rootMetadataNodeId) {
        context.rootNodeId = rootMetadataNodeId;
      }
    }

    return context;
  }

  function buildSerializedState(state) {
    const knownNodeMetadata = state.metadataContext.nodeMetadataById;
    const knownNodePayload = state.metadataContext.nodePayloadById;
    const knownLinks = state.metadataContext.linkById;
    const workspaceDefinition = getWorkspaceDefinition(state.metadataContext.workspaceContext);
    const runtimeTreeNodeIds =
      state.metadataContext.runtimeTreeNodeIds instanceof Set
        ? state.metadataContext.runtimeTreeNodeIds
        : new Set();

    const normalizedRuntimeNodes = [];
    const nextNodeMetadataById = {};
    let nextNodePayloadById = {};
    const seenNodeIds = new Set();

    const inputNodes = Array.isArray(state.nodes) ? state.nodes : [];
    const inputGroupNodes = inputNodes.filter((candidate) => isGroupFlowNode(candidate));
    const normalizedGroupNodes = normalizeGroupFlowNodes(inputGroupNodes);
    const inputCommentNodes = inputNodes.filter((candidate) => isCommentFlowNode(candidate));
    const normalizedCommentNodes = normalizeCommentFlowNodes(inputCommentNodes);
    const groupNodeById = new Map(normalizedGroupNodes.map((groupNode) => [groupNode.id, groupNode]));
    const inputRuntimeNodes = inputNodes.filter((candidate) => !isMetadataFlowNode(candidate));
    for (let index = 0; index < inputRuntimeNodes.length; index += 1) {
      const candidate = inputRuntimeNodes[index];
      const isRawJsonNode = isRawJsonFlowNode(candidate);
      const nodeId = isRawJsonNode
        ? normalizeRawJsonNodeId(candidate?.id)
        : normalizeNodeId(candidate?.id, candidate?.type, index);
      if (seenNodeIds.has(nodeId)) {
        continue;
      }
      seenNodeIds.add(nodeId);

      const baseMeta = isObject(knownNodeMetadata[nodeId]) ? { ...knownNodeMetadata[nodeId] } : {};
      let basePayload = isObject(knownNodePayload[nodeId]) ? { ...knownNodePayload[nodeId] } : {};
      const absolutePosition = readAbsoluteNodePosition(
        candidate,
        groupNodeById,
        index,
        baseMeta?.$Position
      );
      const commentFromNode =
        typeof candidate?.data?.$comment === "string" && candidate.data.$comment.trim()
          ? candidate.data.$comment.trim()
          : undefined;

      if (isRawJsonNode) {
        const rawJsonData = readRawJsonDataValue(candidate?.data, basePayload);
        basePayload = parseRawJsonDataValueToPayload(rawJsonData, basePayload);
        const payloadForLabel = getPayloadForTemplateResolution(
          basePayload,
          nodeId,
          state.metadataContext
        );
        const comment =
          commentFromNode ??
          (typeof basePayload.$Comment === "string" && basePayload.$Comment.trim()
            ? basePayload.$Comment.trim()
            : undefined);
        const label = readNodeLabel(
          nodeId,
          baseMeta,
          candidate?.data?.label,
          payloadForLabel,
          state.metadataContext
        );

        baseMeta.$Position = {
          $x: absolutePosition.x,
          $y: absolutePosition.y,
        };

        const hasExistingExplicitTitle = normalizeNonEmptyString(baseMeta.$Title) !== undefined;
        const defaultComputedLabel = readDefaultNodeLabel(
          nodeId,
          payloadForLabel,
          state.metadataContext
        );
        if (label !== defaultComputedLabel || hasExistingExplicitTitle) {
          baseMeta.$Title = label;
        } else {
          delete baseMeta.$Title;
        }

        basePayload.$NodeId = nodeId;
        if (comment !== undefined) {
          basePayload.$Comment = comment;
        } else {
          delete basePayload.$Comment;
        }

        const parentGroup = findContainingGroupForPosition(absolutePosition, normalizedGroupNodes);
        const position = parentGroup
          ? {
              x: absolutePosition.x - parentGroup.position.x,
              y: absolutePosition.y - parentGroup.position.y,
            }
          : absolutePosition;

        nextNodeMetadataById[nodeId] = baseMeta;
        nextNodePayloadById[nodeId] = basePayload;
        normalizedRuntimeNodes.push({
          id: nodeId,
          type: RAW_JSON_NODE_TYPE,
          data: {
            label,
            [NODE_FIELD_VALUES_DATA_KEY]: {
              [RAW_JSON_DATA_FIELD_ID]: rawJsonData,
            },
            ...(comment !== undefined ? { $comment: comment } : {}),
          },
          position,
          ...(parentGroup ? { parentId: parentGroup.id } : {}),
        });
        continue;
      }

      const payloadForTemplate = getPayloadForTemplateResolution(basePayload, nodeId, state.metadataContext);
      const comment = commentFromNode;
      const templateId = readTemplateId(
        candidate?.data?.[NODE_TEMPLATE_DATA_KEY],
        payloadForTemplate,
        state.metadataContext
      );
      const templateDefinition = resolveTemplateForPayload(
        payloadForTemplate,
        nodeId,
        state.metadataContext,
        templateId
      );
      const resolvedTemplateId = normalizeNonEmptyString(templateDefinition?.templateId);
      const label = readNodeLabel(
        nodeId,
        baseMeta,
        candidate?.data?.label,
        payloadForTemplate,
        state.metadataContext,
        resolvedTemplateId
      );
      const fieldValues = readFieldValues(
        candidate?.data?.[NODE_FIELD_VALUES_DATA_KEY],
        payloadForTemplate,
        resolvedTemplateId,
        state.metadataContext
      );

      baseMeta.$Position = {
        $x: absolutePosition.x,
        $y: absolutePosition.y,
      };

      const hasExistingExplicitTitle = normalizeNonEmptyString(baseMeta.$Title) !== undefined;
      const defaultComputedLabel = readDefaultNodeLabel(
        nodeId,
        payloadForTemplate,
        state.metadataContext,
        resolvedTemplateId
      );
      if (label !== defaultComputedLabel || hasExistingExplicitTitle) {
        baseMeta.$Title = label;
      } else {
        delete baseMeta.$Title;
      }

      basePayload.$NodeId = nodeId;
      const explicitVariantIdentity = readPayloadVariantIdentity(payloadForTemplate, workspaceDefinition, {
        nodeId,
        includeNodeIdFallback: true,
      });
      if (explicitVariantIdentity?.source !== "node-id") {
        basePayload[explicitVariantIdentity.fieldName] = explicitVariantIdentity.value;
      }
      if (comment !== undefined) {
        basePayload.$Comment = comment;
      } else {
        delete basePayload.$Comment;
      }
      delete basePayload[PAYLOAD_TEMPLATE_ID_KEY];
      delete basePayload[PAYLOAD_EDITOR_FIELDS_KEY];

      if (templateDefinition) {
        writeTemplateVariantIdentity(basePayload, templateDefinition, workspaceDefinition);
      } else if (explicitVariantIdentity && explicitVariantIdentity.source !== "node-id") {
        basePayload[explicitVariantIdentity.fieldName] = explicitVariantIdentity.value;
      }
      applyFieldValuesToPayload(basePayload, templateDefinition, fieldValues);

      const parentGroup = findContainingGroupForPosition(absolutePosition, normalizedGroupNodes);
      const position = parentGroup
        ? {
            x: absolutePosition.x - parentGroup.position.x,
            y: absolutePosition.y - parentGroup.position.y,
          }
        : absolutePosition;

      nextNodeMetadataById[nodeId] = baseMeta;
      nextNodePayloadById[nodeId] = basePayload;
      normalizedRuntimeNodes.push({
        id: nodeId,
        type: CUSTOM_NODE_TYPE,
        data: {
          label,
          ...(resolvedTemplateId !== undefined
            ? { [NODE_TEMPLATE_DATA_KEY]: resolvedTemplateId }
            : {}),
          ...(fieldValues !== undefined ? { [NODE_FIELD_VALUES_DATA_KEY]: fieldValues } : {}),
          ...(comment !== undefined ? { $comment: comment } : {}),
        },
        position,
        ...(parentGroup ? { parentId: parentGroup.id } : {}),
      });
    }

    if (normalizedRuntimeNodes.length === 0) {
      const fallbackNode = createDefaultFlowNode(state.metadataContext);
      const fallbackContext = {
        ...state.metadataContext,
        nodeMetadataById: {
          ...nextNodeMetadataById,
          [fallbackNode.id]: {
            $Position: {
              $x: fallbackNode.position.x,
              $y: fallbackNode.position.y,
            },
          },
        },
        nodePayloadById: {
          ...nextNodePayloadById,
          [fallbackNode.id]: (() => {
            const fallbackPayload = {
              $NodeId: fallbackNode.id,
            };
            applyTemplateVariantIdentityToPayload(
              fallbackPayload,
              fallbackNode?.data?.[NODE_TEMPLATE_DATA_KEY],
              state.metadataContext
            );
            return fallbackPayload;
          })(),
        },
      };

      return buildSerializedState({
        ...state,
        nodes: [...normalizedGroupNodes, ...normalizedCommentNodes, fallbackNode],
        metadataContext: fallbackContext,
      });
    }

    const nodeIdSet = new Set(normalizedRuntimeNodes.map((node) => node.id));
    const normalizedEdges = [];
    const seenEdgeIds = new Set();
    const inputEdges = Array.isArray(state.edges) ? state.edges : [];

    for (let index = 0; index < inputEdges.length; index += 1) {
      const candidate = inputEdges[index];
      const source = typeof candidate?.source === "string" ? candidate.source : undefined;
      const target = typeof candidate?.target === "string" ? candidate.target : undefined;
      if (!source || !target || !nodeIdSet.has(source) || !nodeIdSet.has(target)) {
        continue;
      }

      const sourceHandle = normalizeHandleId(candidate?.sourceHandle);
      const targetHandle = normalizeHandleId(candidate?.targetHandle);
      const edgeId =
        typeof candidate?.id === "string" && candidate.id.trim()
          ? candidate.id.trim()
          : `${source}:${sourceHandle ?? "source"}--${target}:${targetHandle ?? "target"}`;

      if (seenEdgeIds.has(edgeId)) {
        continue;
      }
      seenEdgeIds.add(edgeId);

      normalizedEdges.push({
        id: edgeId,
        source,
        ...(sourceHandle !== undefined ? { sourceHandle } : {}),
        target,
        ...(targetHandle !== undefined ? { targetHandle } : {}),
      });
    }

    nextNodePayloadById = applySchemaEdgesToNodePayloads({
      nodePayloadById: nextNodePayloadById,
      edges: normalizedEdges,
      resolveTemplateByNodeId(nodeId, payload) {
        return resolveTemplateForConnectionPayload(nodeId, payload, state.metadataContext);
      },
      resolveMapKeyForTargetNode({ targetNodeId }) {
        return readNodeMapKey(targetNodeId, state.metadataContext, normalizedRuntimeNodes);
      },
    });

    const preservedFloatingRoots = [];
    const floatingCoveredNodeIds = new Set();
    const priorFloatingNodes = Array.isArray(state.metadataContext.floatingNodes)
      ? state.metadataContext.floatingNodes
      : [];

    for (const floatingRoot of priorFloatingNodes) {
      if (!isObject(floatingRoot)) {
        continue;
      }

      const floatingRootId =
        typeof floatingRoot.$NodeId === "string" && floatingRoot.$NodeId.trim()
          ? floatingRoot.$NodeId.trim()
          : undefined;
      if (!floatingRootId || !nodeIdSet.has(floatingRootId)) {
        continue;
      }

      const rewrittenFloatingRoot = rewriteNodePayloadTree(floatingRoot, nextNodePayloadById);
      preservedFloatingRoots.push(rewrittenFloatingRoot);
      collectNodeIdsFromPayload(rewrittenFloatingRoot, floatingCoveredNodeIds);
    }

    for (const normalizedNode of normalizedRuntimeNodes) {
      const nodeId = normalizedNode.id;
      if (runtimeTreeNodeIds.has(nodeId) || floatingCoveredNodeIds.has(nodeId)) {
        continue;
      }

      const existingPayload = isObject(nextNodePayloadById[nodeId]) ? nextNodePayloadById[nodeId] : {};
      const newFloatingRoot = {
        ...existingPayload,
        $NodeId: nodeId,
      };
      const floatingTemplateId = normalizeNonEmptyString(
        normalizedNode?.data?.[NODE_TEMPLATE_DATA_KEY]
      );
      const floatingTemplate = floatingTemplateId
        ? getTemplateById(floatingTemplateId, state.metadataContext.workspaceContext)
        : undefined;
      if (floatingTemplate) {
        writeTemplateVariantIdentity(newFloatingRoot, floatingTemplate, workspaceDefinition);
      }

      const rewrittenFloatingRoot = rewriteNodePayloadTree(newFloatingRoot, nextNodePayloadById);
      preservedFloatingRoots.push(rewrittenFloatingRoot);
      collectNodeIdsFromPayload(rewrittenFloatingRoot, floatingCoveredNodeIds);
      nextNodePayloadById[nodeId] = rewrittenFloatingRoot;
    }

    const nextMetadataContext = {
      workspaceId: state.metadataContext.workspaceId,
      rootNodeId: state.metadataContext.rootNodeId,
      workspaceContext: isObject(state.metadataContext.workspaceContext)
        ? state.metadataContext.workspaceContext
        : {},
      groups: serializeGroupsFromFlowNodes(
        normalizedGroupNodes,
        Array.isArray(state.metadataContext.groups) ? state.metadataContext.groups : []
      ),
      comments: serializeCommentsFromFlowNodes(
        normalizedCommentNodes,
        Array.isArray(state.metadataContext.comments) ? state.metadataContext.comments : []
      ),
      floatingNodes: preservedFloatingRoots,
      runtimeTreeNodeIds,
      metadataExtraFields: isObject(state.metadataContext.metadataExtraFields)
        ? state.metadataContext.metadataExtraFields
        : {},
      nodeMetadataById: nextNodeMetadataById,
      nodePayloadById: nextNodePayloadById,
      linkById: isObject(knownLinks) ? { ...knownLinks } : {},
    };

    const metadata = {
      ...nextMetadataContext.metadataExtraFields,
      ...(nextMetadataContext.workspaceId !== undefined
        ? { $WorkspaceID: nextMetadataContext.workspaceId }
        : {}),
      $Nodes: nextMetadataContext.nodeMetadataById,
      $FloatingNodes: nextMetadataContext.floatingNodes,
      $Links: nextMetadataContext.linkById,
      $Groups: nextMetadataContext.groups,
      $Comments: nextMetadataContext.comments,
    };

    const rewrittenRuntimeFields = rewriteNodePayloadTree(state.runtimeFields, nextNodePayloadById);
    const root = {
      ...(isObject(rewrittenRuntimeFields) ? rewrittenRuntimeFields : {}),
      [NODE_EDITOR_METADATA_KEY]: metadata,
    };

    return {
      nodes: [...normalizedGroupNodes, ...normalizedCommentNodes, ...normalizedRuntimeNodes],
      edges: normalizedEdges,
      metadataContext: nextMetadataContext,
      text: `${JSON.stringify(root, null, 2)}\n`,
    };
  }

  function buildRawJsonPayloadBody(payloadCandidate) {
    const payloadBody = isObject(payloadCandidate) ? { ...payloadCandidate } : {};
    delete payloadBody.$NodeId;
    delete payloadBody.$Comment;
    return payloadBody;
  }

  function stringifyRawJsonPayloadBody(payloadCandidate) {
    const payloadBody = buildRawJsonPayloadBody(payloadCandidate);
    const serialized = JSON.stringify(payloadBody, null, 2);
    return serialized === "{}" ? RAW_JSON_DEFAULT_DATA_VALUE : serialized;
  }

  function readRawJsonDataValue(nodeData, fallbackPayload = {}) {
    const fromFieldValues = nodeData?.[NODE_FIELD_VALUES_DATA_KEY]?.[RAW_JSON_DATA_FIELD_ID];
    if (typeof fromFieldValues === "string") {
      return fromFieldValues;
    }

    return stringifyRawJsonPayloadBody(fallbackPayload);
  }

  function parseRawJsonDataValueToPayload(rawJsonData, fallbackPayload = {}) {
    if (typeof rawJsonData !== "string") {
      return buildRawJsonPayloadBody(fallbackPayload);
    }

    try {
      const parsed = JSON.parse(rawJsonData);
      if (isObject(parsed)) {
        return parsed;
      }
    } catch {
      // Preserve the prior payload body when raw data is not valid JSON.
    }

    return buildRawJsonPayloadBody(fallbackPayload);
  }

  function countRuntimeFlowNodes(flowNodesCandidate) {
    const flowNodes = Array.isArray(flowNodesCandidate) ? flowNodesCandidate : [];
    return flowNodes.filter((flowNode) => !isMetadataFlowNode(flowNode)).length;
  }

  function isGroupFlowNode(candidateNode) {
    return normalizeNonEmptyString(candidateNode?.type) === GROUP_NODE_TYPE;
  }

  function isCommentFlowNode(candidateNode) {
    return normalizeNonEmptyString(candidateNode?.type) === COMMENT_NODE_TYPE;
  }

  function isRawJsonFlowNode(candidateNode) {
    return normalizeNonEmptyString(candidateNode?.type) === RAW_JSON_NODE_TYPE;
  }

  function normalizeRawJsonNodeId(candidateNodeId) {
    const normalizedCandidateNodeId = normalizeNonEmptyString(candidateNodeId);
    if (normalizedCandidateNodeId) {
      return normalizedCandidateNodeId;
    }

    return normalizeNodeId(undefined, "Generic");
  }

  function isMetadataFlowNode(candidateNode) {
    return isGroupFlowNode(candidateNode) || isCommentFlowNode(candidateNode);
  }

  function buildGroupFlowNodes(groupsCandidate) {
    const sourceGroups = Array.isArray(groupsCandidate) ? groupsCandidate : [];
    const flowGroups = [];

    for (let index = 0; index < sourceGroups.length; index += 1) {
      const sourceGroup = isObject(sourceGroups[index]) ? sourceGroups[index] : {};
      const position = normalizePosition(sourceGroup.$Position, index);
      const dimensions = readGroupNodeDimensions(sourceGroup);
      const groupName = readGroupName(sourceGroup.$name);

      flowGroups.push({
        id: `${GROUP_NODE_ID_PREFIX}${index}`,
        type: GROUP_NODE_TYPE,
        data: {
          $groupName: groupName,
        },
        position,
        width: dimensions.width,
        height: dimensions.height,
        selected: false,
        draggable: false,
        zIndex: GROUP_Z_INDEX_UNSELECTED,
      });
    }

    return flowGroups;
  }

  function normalizeGroupFlowNodes(groupNodesCandidate) {
    const sourceGroups = Array.isArray(groupNodesCandidate) ? groupNodesCandidate : [];
    const normalizedGroups = [];
    const seenGroupIds = new Set();

    for (let index = 0; index < sourceGroups.length; index += 1) {
      const sourceGroup = sourceGroups[index];
      const fallbackGroupId = `${GROUP_NODE_ID_PREFIX}${index}`;
      let groupId = normalizeNonEmptyString(sourceGroup?.id) ?? fallbackGroupId;
      if (seenGroupIds.has(groupId)) {
        groupId = `${fallbackGroupId}-${index}`;
      }
      seenGroupIds.add(groupId);

      const position = normalizePosition(sourceGroup?.position, index);
      const dimensions = readGroupNodeDimensions(sourceGroup);
      const groupName = readGroupName(sourceGroup?.data?.$groupName);
      const isSelected = sourceGroup?.selected === true;
      const isDraggable =
        typeof sourceGroup?.draggable === "boolean" ? sourceGroup.draggable : isSelected;
      const normalizedGroupZIndex = isSelected ? GROUP_Z_INDEX_SELECTED : GROUP_Z_INDEX_UNSELECTED;

      normalizedGroups.push({
        id: groupId,
        type: GROUP_NODE_TYPE,
        data: {
          $groupName: groupName,
        },
        position,
        width: dimensions.width,
        height: dimensions.height,
        selected: isSelected,
        draggable: isDraggable,
        zIndex: normalizedGroupZIndex,
      });
    }

    return normalizedGroups;
  }

  function buildCommentFlowNodes(commentsCandidate) {
    const sourceComments = Array.isArray(commentsCandidate) ? commentsCandidate : [];
    const flowComments = [];

    for (let index = 0; index < sourceComments.length; index += 1) {
      const sourceComment = isObject(sourceComments[index]) ? sourceComments[index] : {};
      const position = normalizePosition(sourceComment.$Position, index);
      const dimensions = readCommentNodeDimensions(sourceComment);
      const commentName = normalizeCommentName(sourceComment.$name);
      const commentText = normalizeCommentText(sourceComment?.$text);
      const commentFontSize = normalizeCommentFontSize(sourceComment.$fontSize);

      flowComments.push({
        id: `${COMMENT_NODE_ID_PREFIX}${index}`,
        type: COMMENT_NODE_TYPE,
        data: {
          $commentName: commentName,
          $commentText: commentText,
          $fontSize: commentFontSize,
        },
        position,
        width: dimensions.width,
        height: dimensions.height,
        selected: false,
      });
    }

    return flowComments;
  }

  function normalizeCommentFlowNodes(commentNodesCandidate) {
    const sourceComments = Array.isArray(commentNodesCandidate) ? commentNodesCandidate : [];
    const normalizedComments = [];
    const seenCommentIds = new Set();

    for (let index = 0; index < sourceComments.length; index += 1) {
      const sourceComment = sourceComments[index];
      const fallbackCommentId = `${COMMENT_NODE_ID_PREFIX}${index}`;
      let commentId = normalizeNonEmptyString(sourceComment?.id) ?? fallbackCommentId;
      if (seenCommentIds.has(commentId)) {
        commentId = `${fallbackCommentId}-${index}`;
      }
      seenCommentIds.add(commentId);

      const position = normalizePosition(sourceComment?.position, index);
      const dimensions = readCommentNodeDimensions(sourceComment);
      const commentName = normalizeCommentName(sourceComment?.data?.$commentName);
      const commentText = normalizeCommentText(sourceComment?.data?.$commentText);
      const commentFontSize = normalizeCommentFontSize(sourceComment?.data?.$fontSize);
      const isSelected = sourceComment?.selected === true;
      const isDraggable =
        typeof sourceComment?.draggable === "boolean" ? sourceComment.draggable : true;

      normalizedComments.push({
        id: commentId,
        type: COMMENT_NODE_TYPE,
        data: {
          $commentName: commentName,
          $commentText: commentText,
          $fontSize: commentFontSize,
        },
        position,
        width: dimensions.width,
        height: dimensions.height,
        selected: isSelected,
        draggable: isDraggable,
      });
    }

    return normalizedComments;
  }

  function assignNodesToGroups(runtimeNodesCandidate, groupNodesCandidate) {
    const runtimeNodes = Array.isArray(runtimeNodesCandidate) ? runtimeNodesCandidate : [];
    const groupNodes = Array.isArray(groupNodesCandidate) ? groupNodesCandidate : [];

    return runtimeNodes.map((runtimeNode, index) => {
      const absolutePosition = normalizePosition(runtimeNode?.position, index);
      const containingGroup = findContainingGroupForPosition(absolutePosition, groupNodes);
      if (!containingGroup) {
        const detachedNode = {
          ...runtimeNode,
          position: absolutePosition,
        };
        delete detachedNode.parentId;
        return detachedNode;
      }

      return {
        ...runtimeNode,
        position: {
          x: absolutePosition.x - containingGroup.position.x,
          y: absolutePosition.y - containingGroup.position.y,
        },
        parentId: containingGroup.id,
      };
    });
  }

  function readAbsoluteNodePosition(
    nodeCandidate,
    groupNodeById,
    index = 0,
    fallbackPositionCandidate = undefined
  ) {
    const relativePosition = normalizePosition(nodeCandidate?.position, index);
    const parentGroupId = normalizeNonEmptyString(nodeCandidate?.parentId);
    if (!parentGroupId || !(groupNodeById instanceof Map)) {
      return relativePosition;
    }

    const parentGroup = groupNodeById.get(parentGroupId);
    if (!parentGroup) {
      if (fallbackPositionCandidate !== undefined) {
        return normalizePosition(fallbackPositionCandidate, index);
      }
      return relativePosition;
    }

    return {
      x: relativePosition.x + parentGroup.position.x,
      y: relativePosition.y + parentGroup.position.y,
    };
  }

  function findContainingGroupForPosition(position, groupNodesCandidate) {
    const groupNodes = Array.isArray(groupNodesCandidate) ? groupNodesCandidate : [];
    let selectedGroup;
    let selectedGroupArea = Number.POSITIVE_INFINITY;

    for (const groupNode of groupNodes) {
      if (!isPositionInsideGroup(position, groupNode)) {
        continue;
      }

      const dimensions = readGroupNodeDimensions(groupNode);
      const area = dimensions.width * dimensions.height;
      if (area < selectedGroupArea) {
        selectedGroup = groupNode;
        selectedGroupArea = area;
      }
    }

    return selectedGroup;
  }

  function isPositionInsideGroup(positionCandidate, groupNode) {
    const position = normalizePosition(positionCandidate, 0);
    const groupPosition = normalizePosition(groupNode?.position, 0);
    const dimensions = readGroupNodeDimensions(groupNode);

    return (
      position.x >= groupPosition.x &&
      position.x <= groupPosition.x + dimensions.width &&
      position.y >= groupPosition.y &&
      position.y <= groupPosition.y + dimensions.height
    );
  }

  function readGroupNodeDimensions(groupNode) {
    return {
      width: normalizeGroupDimension(
        groupNode?.width ?? groupNode?.initialWidth ?? groupNode?.measured?.width ?? groupNode?.$width,
        DEFAULT_GROUP_WIDTH,
        MIN_GROUP_WIDTH
      ),
      height: normalizeGroupDimension(
        groupNode?.height ?? groupNode?.initialHeight ?? groupNode?.measured?.height ?? groupNode?.$height,
        DEFAULT_GROUP_HEIGHT,
        MIN_GROUP_HEIGHT
      ),
    };
  }

  function normalizeGroupDimension(candidateValue, fallbackValue, minValue) {
    const normalizedValue = Number(candidateValue);
    if (!Number.isFinite(normalizedValue)) {
      return fallbackValue;
    }

    return Math.max(minValue, normalizedValue);
  }

  function readGroupName(candidateName) {
    const normalizedName = normalizeNonEmptyString(candidateName);
    return normalizedName ?? DEFAULT_GROUP_NAME;
  }

  function readCommentNodeDimensions(commentNode) {
    return {
      width: normalizeGroupDimension(
        commentNode?.width ?? commentNode?.initialWidth ?? commentNode?.measured?.width ?? commentNode?.$width,
        COMMENT_DEFAULT_WIDTH,
        COMMENT_MIN_WIDTH
      ),
      height: normalizeGroupDimension(
        commentNode?.height ?? commentNode?.initialHeight ?? commentNode?.measured?.height ?? commentNode?.$height,
        COMMENT_DEFAULT_HEIGHT,
        COMMENT_MIN_HEIGHT
      ),
    };
  }

  function serializeGroupsFromFlowNodes(groupNodesCandidate, priorGroupsCandidate) {
    const groupNodes = Array.isArray(groupNodesCandidate) ? groupNodesCandidate : [];
    const priorGroups = Array.isArray(priorGroupsCandidate) ? priorGroupsCandidate : [];

    return groupNodes.map((groupNode, index) => {
      const priorGroup = isObject(priorGroups[index]) ? priorGroups[index] : {};
      const dimensions = readGroupNodeDimensions(groupNode);
      const position = normalizePosition(groupNode?.position, index);
      const groupName = readGroupName(groupNode?.data?.$groupName);

      return {
        ...omitKeys(priorGroup, GROUP_RESERVED_KEYS),
        $Position: {
          $x: position.x,
          $y: position.y,
        },
        $width: dimensions.width,
        $height: dimensions.height,
        $name: groupName,
      };
    });
  }

  function serializeCommentsFromFlowNodes(commentNodesCandidate, priorCommentsCandidate) {
    const commentNodes = Array.isArray(commentNodesCandidate) ? commentNodesCandidate : [];
    const priorComments = Array.isArray(priorCommentsCandidate) ? priorCommentsCandidate : [];

    return commentNodes.map((commentNode, index) => {
      const priorComment = isObject(priorComments[index]) ? priorComments[index] : {};
      const dimensions = readCommentNodeDimensions(commentNode);
      const position = normalizePosition(commentNode?.position, index);
      const commentName = normalizeCommentName(commentNode?.data?.$commentName);
      const commentText = normalizeCommentText(commentNode?.data?.$commentText);
      const commentFontSize = normalizeCommentFontSize(commentNode?.data?.$fontSize);
      const shouldPersistFontSize =
        commentFontSize !== COMMENT_DEFAULT_FONT_SIZE ||
        Object.prototype.hasOwnProperty.call(priorComment, "$fontSize");

      return {
        ...omitKeys(priorComment, COMMENT_RESERVED_KEYS),
        $Position: {
          $x: position.x,
          $y: position.y,
        },
        $width: dimensions.width,
        $height: dimensions.height,
        $name: commentName,
        $text: commentText,
        ...(shouldPersistFontSize ? { $fontSize: commentFontSize } : {}),
      };
    });
  }

  function createEmptyMetadataContext(workspaceContext = undefined) {
    return {
      workspaceId: normalizeNonEmptyString(workspaceContext?.rootMenuName),
      rootNodeId: undefined,
      workspaceContext: isObject(workspaceContext) ? workspaceContext : {},
      groups: [],
      comments: [],
      floatingNodes: [],
      runtimeTreeNodeIds: new Set(),
      metadataExtraFields: {},
      nodeMetadataById: {},
      nodePayloadById: {},
      linkById: {},
    };
  }

  function createDefaultFlowNode(context = undefined) {
    const nodeId = "Node-00000000-0000-0000-0000-000000000000";
    const defaultTemplate = getDefaultTemplate(context?.workspaceContext);
    if (!defaultTemplate) {
      return {
        id: nodeId,
        type: CUSTOM_NODE_TYPE,
        data: {
          label: defaultLabelForNodeId(nodeId),
        },
        position: { x: 0, y: 50 },
      };
    }

    return {
      id: nodeId,
      type: CUSTOM_NODE_TYPE,
      data: {
        label: normalizeNonEmptyString(defaultTemplate.label) ?? defaultLabelForNodeId(nodeId),
        [NODE_TEMPLATE_DATA_KEY]: defaultTemplate.templateId,
        [NODE_FIELD_VALUES_DATA_KEY]: defaultTemplate.buildInitialValues(),
      },
      position: { x: 0, y: 50 },
    };
  }

  function readNodeLabel(
    nodeId,
    nodeMeta,
    candidateLabel,
    payload,
    context = metadataContext,
    templateId = undefined
  ) {
    const fromCandidate =
      typeof candidateLabel === "string" && candidateLabel.trim() ? candidateLabel.trim() : undefined;
    if (fromCandidate !== undefined) {
      return fromCandidate;
    }

    const fromMeta = typeof nodeMeta?.$Title === "string" && nodeMeta.$Title.trim()
      ? nodeMeta.$Title.trim()
      : undefined;
    if (fromMeta !== undefined) {
      return fromMeta;
    }

    return readDefaultNodeLabel(nodeId, payload, context, templateId);
  }

  function readDefaultNodeLabel(nodeId, payload, context = metadataContext, templateId = undefined) {
    const template = resolveTemplateForPayload(payload, nodeId, context, templateId);
    const fromTemplate = normalizeNonEmptyString(template?.label);
    if (fromTemplate !== undefined) {
      return fromTemplate;
    }

    const workspaceDefinition = getWorkspaceDefinitionForContext(context);
    const variantIdentity = readPayloadVariantIdentity(payload, workspaceDefinition, {
      nodeId: payload?.$NodeId ?? nodeId,
      includeNodeIdFallback: true,
    });
    const fromVariantIdentity = normalizeNonEmptyString(variantIdentity?.value);
    if (fromVariantIdentity !== undefined) {
      return fromVariantIdentity;
    }

    const fromNodeIdType = readTypeFromNodeId(payload?.$NodeId ?? nodeId);
    if (fromNodeIdType !== undefined) {
      return fromNodeIdType;
    }

    return defaultLabelForNodeId(nodeId);
  }

  function readTemplateId(candidateTemplateId, payload, context = metadataContext) {
    const inferredTemplate = resolveTemplateByPayloadType(payload, context, payload?.$NodeId);
    if (inferredTemplate) {
      return inferredTemplate.templateId;
    }

    const normalizedCandidateTemplateId = normalizeNonEmptyString(candidateTemplateId);
    if (normalizedCandidateTemplateId) {
      return normalizedCandidateTemplateId;
    }

    const payloadTemplateId = normalizeNonEmptyString(payload?.[PAYLOAD_TEMPLATE_ID_KEY]);
    if (payloadTemplateId) {
      return payloadTemplateId;
    }

    return undefined;
  }

  function resolveLegacyNodeIdPrefix({
    payload,
    keyHint,
    parentPayload,
    parentNodeId,
    isRoot = false,
    workspaceContext,
  }) {
    const payloadObject = isObject(payload) ? payload : {};
    const normalizedKeyHint = normalizeNonEmptyString(keyHint);
    const context = {
      workspaceContext: isObject(workspaceContext) ? workspaceContext : {},
    };
    const inferredTemplate = resolveTemplateByPayloadType(payloadObject, context, payloadObject.$NodeId);
    const templateIdFromType = normalizeNonEmptyString(inferredTemplate?.templateId);
    if (templateIdFromType) {
      return templateIdFromType;
    }

    if (isRoot) {
      const rootTemplateId = normalizeNonEmptyString(workspaceContext?.rootTemplateId);
      if (rootTemplateId) {
        return rootTemplateId;
      }
    }

    if (normalizedKeyHint && isObject(parentPayload)) {
      const parentTemplate = resolveTemplateForPayload(
        parentPayload,
        parentNodeId,
        context
      );
      const matchedDescriptor = Array.isArray(parentTemplate?.schemaConnections)
        ? parentTemplate.schemaConnections.find(
            (descriptor) => doesConnectionDescriptorMatchKey(descriptor, normalizedKeyHint)
          )
        : undefined;
      const selector = normalizeNonEmptyString(matchedDescriptor?.nodeSelector);
      if (selector) {
        const selectorTemplates = getTemplatesForNodeSelector(selector, workspaceContext);
        const preferredTemplate = Array.isArray(selectorTemplates)
          ? selectorTemplates[0]
          : undefined;
        const templateIdFromSelector = normalizeNonEmptyString(preferredTemplate?.templateId);
        if (templateIdFromSelector) {
          return templateIdFromSelector;
        }

        const schemaTypeFromSelector = normalizeNonEmptyString(preferredTemplate?.schemaType);
        if (schemaTypeFromSelector) {
          return schemaTypeFromSelector;
        }

        return selector;
      }
    }

    const workspaceDefinition = getWorkspaceDefinition(workspaceContext);
    const inferredIdentity = readPayloadVariantIdentity(payloadObject, workspaceDefinition, {
      nodeId: payloadObject.$NodeId,
      includeNodeIdFallback: true,
    });
    if (inferredIdentity?.value) {
      return inferredIdentity.value;
    }

    if (normalizedKeyHint) {
      return normalizedKeyHint;
    }

    return "Node";
  }

  function readFieldValues(
    candidateFieldValues,
    payload,
    templateId = undefined,
    context = metadataContext
  ) {
    const candidateObject = normalizeFieldValuesObject(candidateFieldValues);
    if (candidateObject !== undefined) {
      return candidateObject;
    }

    const resolvedTemplateId = normalizeNonEmptyString(templateId) ?? readTemplateId(undefined, payload, context);
    const template = resolveTemplateForPayload(payload, payload?.$NodeId, context, resolvedTemplateId);

    const extractedFieldValues = extractFieldValuesFromPayload(payload, template);
    if (extractedFieldValues !== undefined) {
      return extractedFieldValues;
    }

    const payloadFieldValues = normalizeFieldValuesObject(payload?.[PAYLOAD_EDITOR_FIELDS_KEY]);
    if (payloadFieldValues !== undefined) {
      return payloadFieldValues;
    }

    return template?.buildInitialValues();
  }

  function extractFieldValuesFromPayload(payload, template) {
    if (!isObject(payload) || !Array.isArray(template?.fields)) {
      return undefined;
    }

    let hasAnyValue = false;
    const extracted = {};
    for (const field of template.fields) {
      const fieldId = typeof field?.id === "string" ? field.id.trim() : "";
      if (!fieldId) {
        continue;
      }

      const runtimeKey =
        normalizeNonEmptyString(template?.fieldRuntimeKeyByFieldId?.[fieldId]) ?? fieldId;
      if (!Object.prototype.hasOwnProperty.call(payload, runtimeKey)) {
        continue;
      }

      extracted[fieldId] = payload[runtimeKey];
      hasAnyValue = true;
    }

    return hasAnyValue ? extracted : undefined;
  }

  function applyFieldValuesToPayload(payload, templateDefinition, fieldValues) {
    if (!isObject(payload) || !isObject(fieldValues)) {
      return;
    }

    if (!Array.isArray(templateDefinition?.fields)) {
      Object.assign(payload, fieldValues);
      return;
    }

    for (const field of templateDefinition.fields) {
      const fieldId = typeof field?.id === "string" ? field.id.trim() : "";
      if (!fieldId || !Object.prototype.hasOwnProperty.call(fieldValues, fieldId)) {
        continue;
      }

      const runtimeKey =
        normalizeNonEmptyString(templateDefinition?.fieldRuntimeKeyByFieldId?.[fieldId]) ??
        fieldId;
      payload[runtimeKey] = fieldValues[fieldId];
    }
  }

  function normalizeFieldValuesObject(candidateValue) {
    if (!isObject(candidateValue)) {
      return undefined;
    }

    return { ...candidateValue };
  }

  function resolveTemplateForConnectionPayload(nodeId, payload, context) {
    return resolveTemplateForPayload(payload, nodeId, context);
  }

  function resolveTemplateForPayload(
    payload,
    nodeId,
    context = metadataContext,
    explicitTemplateId = undefined
  ) {
    const payloadForTemplate = getPayloadForTemplateResolution(payload, nodeId, context);
    const workspaceContext = context?.workspaceContext;

    const fromVariantIdentity = resolveTemplateByPayloadType(payloadForTemplate, context, nodeId);
    if (fromVariantIdentity) {
      return fromVariantIdentity;
    }

    const resolvedTemplateId = normalizeNonEmptyString(explicitTemplateId);
    if (resolvedTemplateId) {
      const fromTemplateId = getTemplateById(resolvedTemplateId, workspaceContext);
      if (fromTemplateId) {
        return fromTemplateId;
      }
    }

    const payloadTemplateId = normalizeNonEmptyString(payloadForTemplate?.[PAYLOAD_TEMPLATE_ID_KEY]);
    if (payloadTemplateId) {
      const fromPayloadTemplateId = getTemplateById(payloadTemplateId, workspaceContext);
      if (fromPayloadTemplateId) {
        return fromPayloadTemplateId;
      }
    }

    if (
      typeof nodeId === "string" &&
      nodeId &&
      typeof context?.rootNodeId === "string" &&
      context.rootNodeId === nodeId
    ) {
      const rootTemplateId = normalizeNonEmptyString(context?.workspaceContext?.rootTemplateId);
      if (rootTemplateId) {
        return getTemplateById(rootTemplateId, workspaceContext);
      }
    }

    return undefined;
  }

  function getPayloadForTemplateResolution(payload, nodeId, context) {
    const normalizedPayload = isObject(payload) ? payload : {};
    const workspaceDefinition = getWorkspaceDefinitionForContext(context);
    const identityInPayload = readPayloadVariantIdentity(normalizedPayload, workspaceDefinition, {
      nodeId: normalizedPayload.$NodeId ?? nodeId,
      includeNodeIdFallback: false,
    });
    if (identityInPayload) {
      return normalizedPayload;
    }

    if (
      typeof nodeId === "string" &&
      nodeId &&
      typeof context?.rootNodeId === "string" &&
      context.rootNodeId === nodeId
    ) {
      const rootTemplateId = normalizeNonEmptyString(context?.workspaceContext?.rootTemplateId);
      if (!rootTemplateId) {
        return normalizedPayload;
      }

      const rootTemplate = getTemplateById(rootTemplateId, context?.workspaceContext);
      if (rootTemplate) {
        const payloadWithIdentity = { ...normalizedPayload };
        writeTemplateVariantIdentity(payloadWithIdentity, rootTemplate, workspaceDefinition);
        return payloadWithIdentity;
      }
    }

    return normalizedPayload;
  }

  function readNodeMapKey(nodeId, context, flowNodesCandidate = nodes) {
    if (typeof nodeId !== "string" || !nodeId.trim()) {
      return undefined;
    }

    const nodeMeta = context?.nodeMetadataById?.[nodeId];
    const fromMetadataTitle =
      typeof nodeMeta?.$Title === "string" && nodeMeta.$Title.trim()
        ? nodeMeta.$Title.trim()
        : undefined;
    if (fromMetadataTitle) {
      return fromMetadataTitle;
    }

    const flowNode = Array.isArray(flowNodesCandidate)
      ? flowNodesCandidate.find((candidate) => candidate.id === nodeId)
      : undefined;
    const fromFlowLabel =
      typeof flowNode?.data?.label === "string" && flowNode.data.label.trim()
        ? flowNode.data.label.trim()
        : undefined;
    if (fromFlowLabel) {
      return fromFlowLabel;
    }

    return nodeId;
  }

  function resolveTemplateByPayloadType(payload, context = metadataContext, nodeId = undefined) {
    const workspaceContext = context?.workspaceContext;
    const workspaceDefinition = getWorkspaceDefinition(workspaceContext);
    const variantResolution = resolveTemplateIdFromPayloadVariant(payload, workspaceDefinition, {
      nodeId,
      includeNodeIdFallback: true,
    });

    const payloadVariantValue = normalizeNonEmptyString(variantResolution?.identity?.value);
    if (payloadVariantValue) {
      const candidates = findTemplatesByTypeName(payloadVariantValue, workspaceContext);
      if (Array.isArray(candidates) && candidates.length > 0) {
        if (candidates.length === 1) {
          return candidates[0];
        }

        return chooseBestTemplateCandidateForPayload(payload, candidates, context);
      }

      const directTypeTemplate = findTemplateByTypeName(payloadVariantValue, workspaceContext);
      if (directTypeTemplate) {
        return directTypeTemplate;
      }
    }

    const templateIdFromVariant = normalizeNonEmptyString(variantResolution?.templateId);
    if (templateIdFromVariant) {
      const mappedTemplate = getTemplateById(templateIdFromVariant, workspaceContext);
      if (mappedTemplate) {
        return mappedTemplate;
      }
    }

    return undefined;
  }

  function normalizeConnectionRuntimeKey(schemaKeyCandidate) {
    const schemaKey = normalizeNonEmptyString(schemaKeyCandidate);
    if (!schemaKey) {
      return undefined;
    }

    if (!schemaKey.endsWith("$Pin")) {
      return schemaKey;
    }

    const withoutSuffix = schemaKey.slice(0, -"$Pin".length);
    return normalizeNonEmptyString(withoutSuffix) ?? schemaKey;
  }

  function collectConnectionDescriptorKeys(descriptor) {
    const schemaKey = normalizeConnectionRuntimeKey(descriptor?.schemaKey);
    return schemaKey ? [schemaKey] : [];
  }

  function doesConnectionDescriptorMatchKey(descriptor, keyCandidate) {
    const key = normalizeNonEmptyString(keyCandidate);
    if (!key) {
      return false;
    }

    return collectConnectionDescriptorKeys(descriptor).includes(key);
  }

  function chooseBestTemplateCandidateForPayload(payload, candidates, context = metadataContext) {
    if (!isObject(payload) || !Array.isArray(candidates) || candidates.length === 0) {
      return candidates?.[0];
    }

    const excludedPayloadKeys = buildTemplateResolutionExcludedPayloadKeys(context);
    const runtimePayloadKeys = Object.keys(payload).filter(
      (key) => !excludedPayloadKeys.has(key)
    );
    if (runtimePayloadKeys.length === 0) {
      return candidates[0];
    }

    let bestCandidate = candidates[0];
    let bestScore = -1;
    let bestMatchedKeyCount = -1;

    for (const candidate of candidates) {
      const connectionKeySet = new Set(
        Array.isArray(candidate?.schemaConnections)
          ? candidate.schemaConnections
              .flatMap((descriptor) => collectConnectionDescriptorKeys(descriptor))
          : []
      );
      const fieldKeySet = new Set(
        Object.values(isObject(candidate?.fieldRuntimeKeyByFieldId) ? candidate.fieldRuntimeKeyByFieldId : {})
          .map((runtimeKey) => normalizeNonEmptyString(runtimeKey))
          .filter((runtimeKey) => Boolean(runtimeKey))
      );

      let score = 0;
      let matchedKeyCount = 0;
      for (const runtimePayloadKey of runtimePayloadKeys) {
        if (connectionKeySet.has(runtimePayloadKey)) {
          score += 5;
          matchedKeyCount += 1;
          continue;
        }

        if (fieldKeySet.has(runtimePayloadKey)) {
          score += 3;
          matchedKeyCount += 1;
        }
      }

      if (
        score > bestScore ||
        (score === bestScore && matchedKeyCount > bestMatchedKeyCount)
      ) {
        bestCandidate = candidate;
        bestScore = score;
        bestMatchedKeyCount = matchedKeyCount;
      }
    }

    return bestCandidate;
  }

</script>

<main class="flex flex-col h-screen min-h-0 p-3">
  {#if extensionError}
    <div class="mb-2 text-sm text-vsc-error">{extensionError}</div>
  {/if}
  <SvelteFlowProvider>
    <Flow
      bind:nodes
      bind:edges
      loadVersion={graphLoadVersion}
      templateSourceMode={templateSourceMode}
      workspaceContext={metadataContext?.workspaceContext}
      on:flowchange={handleFlowChange}
    />
  </SvelteFlowProvider>
</main>
