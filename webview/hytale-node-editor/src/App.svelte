<script>
  import { onMount } from "svelte";
  import { SvelteFlowProvider } from "@xyflow/svelte";
  import Flow from "./Flow.svelte";
  import {
    CUSTOM_NODE_TYPE,
    GROUP_NODE_TYPE,
    PAYLOAD_EDITOR_FIELDS_KEY,
    PAYLOAD_TEMPLATE_ID_KEY,
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
    getTemplatesForNodeSelector,
    setActiveWorkspaceContext,
    setActiveTemplateSourceMode,
  } from "./node-editor/templateCatalog.js";
  import {
    applySchemaEdgesToNodePayloads,
    extractSchemaEdgesFromNodePayloads,
  } from "./node-editor/connectionSchemaMapper.js";
  import {
    LEGACY_ROOT_EDITOR_KEYS,
    convertLegacyInlineAssetDocument,
    isLegacyInlineAssetDocument,
  } from "./node-editor/legacyAssetDocumentConverter.js";
  import { resolveWorkspaceContext } from "./node-editor/workspaceContextResolver.js";

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
  const GROUP_NODE_ID_PREFIX = "__group__";
  const DEFAULT_GROUP_NAME = "Group";
  const DEFAULT_GROUP_WIDTH = 520;
  const DEFAULT_GROUP_HEIGHT = 320;
  const MIN_GROUP_WIDTH = 180;
  const MIN_GROUP_HEIGHT = 120;
  const GROUP_RESERVED_KEYS = ["$Position", "$width", "$height", "$name"];
  const NODE_PAYLOAD_TEMPLATE_RESOLUTION_EXCLUDED_KEYS = new Set([
    "$NodeId",
    "$Comment",
    "Type",
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
    if (!hasMetadataContainer && isLegacyInlineAssetDocument(parsed)) {
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
      });
      return buildStateFromMetadataDocument(
        convertedLegacy.runtime,
        convertedLegacy.metadataRoot,
        sourceDocumentPath
      );
    }

    const metadataRoot = hasMetadataContainer ? parsed[NODE_EDITOR_METADATA_KEY] : {};
    const runtime = hasMetadataContainer ? omitKeys(parsed, [NODE_EDITOR_METADATA_KEY]) : parsed;
    return buildStateFromMetadataDocument(runtime, metadataRoot, sourceDocumentPath);
  }

  function buildStateFromMetadataDocument(runtime, metadataRoot, sourceDocumentPath = documentPath) {
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
    let flowState = buildFlowStateFromMetadata(context);

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
    nextContext.nodePayloadById[fallbackNode.id] = {
      $NodeId: fallbackNode.id,
      ...(normalizeNonEmptyString(fallbackNode?.data?.Type)
        ? { Type: fallbackNode.data.Type.trim() }
        : {}),
    };
    if (!nextContext.rootNodeId) {
      nextContext.rootNodeId = fallbackNode.id;
    }

    return nextContext;
  }

  function buildFlowStateFromMetadata(context) {
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
      const label = readNodeLabel(nodeId, nodeMeta, undefined, payloadForTemplate);
      const comment =
        typeof payloadForTemplate.$Comment === "string" && payloadForTemplate.$Comment.trim()
          ? payloadForTemplate.$Comment.trim()
          : undefined;
      const templateId = readTemplateId(undefined, payloadForTemplate, context);
      const fieldValues = readFieldValues(undefined, payloadForTemplate, templateId, context);

      runtimeFlowNodes.push({
        id: nodeId,
        type: CUSTOM_NODE_TYPE,
        data: {
          label,
          ...(templateId !== undefined ? { [NODE_TEMPLATE_DATA_KEY]: templateId } : {}),
          ...(fieldValues !== undefined ? { [NODE_FIELD_VALUES_DATA_KEY]: fieldValues } : {}),
          ...(comment !== undefined ? { $comment: comment } : {}),
        },
        position,
      });
    }

    const groupFlowNodes = buildGroupFlowNodes(context.groups);
    const groupedRuntimeNodes = assignNodesToGroups(runtimeFlowNodes, groupFlowNodes);

    return {
      nodes: [...groupFlowNodes, ...groupedRuntimeNodes],
      edges: parsedEdges,
    };
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
    context.comments = Array.isArray(metadataRoot.$Comments) ? metadataRoot.$Comments : [];
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
    const groupNodeById = new Map(normalizedGroupNodes.map((groupNode) => [groupNode.id, groupNode]));
    const inputRuntimeNodes = inputNodes.filter((candidate) => !isGroupFlowNode(candidate));
    for (let index = 0; index < inputRuntimeNodes.length; index += 1) {
      const candidate = inputRuntimeNodes[index];
      const nodeId = normalizeNodeId(candidate?.id, candidate?.type, index);
      if (seenNodeIds.has(nodeId)) {
        continue;
      }
      seenNodeIds.add(nodeId);

      const baseMeta = isObject(knownNodeMetadata[nodeId]) ? { ...knownNodeMetadata[nodeId] } : {};
      const basePayload = isObject(knownNodePayload[nodeId]) ? { ...knownNodePayload[nodeId] } : {};
      const payloadForTemplate = getPayloadForTemplateResolution(basePayload, nodeId, state.metadataContext);
      const absolutePosition = readAbsoluteNodePosition(
        candidate,
        groupNodeById,
        index,
        baseMeta?.$Position
      );
      const label = readNodeLabel(nodeId, baseMeta, candidate?.data?.label, payloadForTemplate);
      const comment =
        typeof candidate?.data?.$comment === "string" && candidate.data.$comment.trim()
          ? candidate.data.$comment.trim()
          : undefined;
      const templateId = readTemplateId(
        candidate?.data?.[NODE_TEMPLATE_DATA_KEY],
        payloadForTemplate,
        state.metadataContext
      );
      const fieldValues = readFieldValues(
        candidate?.data?.[NODE_FIELD_VALUES_DATA_KEY],
        payloadForTemplate,
        templateId,
        state.metadataContext
      );

      baseMeta.$Position = {
        $x: absolutePosition.x,
        $y: absolutePosition.y,
      };

      if (label !== defaultLabelForNodeId(nodeId) || typeof baseMeta.$Title === "string") {
        baseMeta.$Title = label;
      } else {
        delete baseMeta.$Title;
      }

      basePayload.$NodeId = nodeId;
      const explicitType = normalizeNonEmptyString(payloadForTemplate.Type);
      if (explicitType) {
        basePayload.Type = explicitType;
      } else {
        delete basePayload.Type;
      }
      if (comment !== undefined) {
        basePayload.$Comment = comment;
      } else {
        delete basePayload.$Comment;
      }
      delete basePayload[PAYLOAD_TEMPLATE_ID_KEY];
      delete basePayload[PAYLOAD_EDITOR_FIELDS_KEY];

      const templateDefinition = resolveTemplateForPayload(
        payloadForTemplate,
        nodeId,
        state.metadataContext,
        templateId
      );
      if (!explicitType && templateDefinition?.schemaType) {
        basePayload.Type = templateDefinition.schemaType;
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
          ...(templateId !== undefined ? { [NODE_TEMPLATE_DATA_KEY]: templateId } : {}),
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
          [fallbackNode.id]: {
            $NodeId: fallbackNode.id,
            ...(normalizeNonEmptyString(fallbackNode?.data?.Type)
              ? { Type: fallbackNode.data.Type.trim() }
              : {}),
          },
        },
      };

      return buildSerializedState({
        ...state,
        nodes: [...normalizedGroupNodes, fallbackNode],
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
      if (
        typeof newFloatingRoot.Type !== "string" &&
        normalizeNonEmptyString(floatingTemplate?.schemaType)
      ) {
        newFloatingRoot.Type = floatingTemplate.schemaType;
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
      comments: Array.isArray(state.metadataContext.comments) ? state.metadataContext.comments : [],
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
      nodes: [...normalizedGroupNodes, ...normalizedRuntimeNodes],
      edges: normalizedEdges,
      metadataContext: nextMetadataContext,
      text: `${JSON.stringify(root, null, 2)}\n`,
    };
  }

  function countRuntimeFlowNodes(flowNodesCandidate) {
    const flowNodes = Array.isArray(flowNodesCandidate) ? flowNodesCandidate : [];
    return flowNodes.filter((flowNode) => !isGroupFlowNode(flowNode)).length;
  }

  function isGroupFlowNode(candidateNode) {
    return normalizeNonEmptyString(candidateNode?.type) === GROUP_NODE_TYPE;
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
      });
    }

    return normalizedGroups;
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
        label: defaultLabelForNodeId(nodeId),
        ...(normalizeNonEmptyString(defaultTemplate.schemaType)
          ? { Type: defaultTemplate.schemaType }
          : {}),
        [NODE_TEMPLATE_DATA_KEY]: defaultTemplate.templateId,
        [NODE_FIELD_VALUES_DATA_KEY]: defaultTemplate.buildInitialValues(),
      },
      position: { x: 0, y: 50 },
    };
  }

  function readNodeLabel(nodeId, nodeMeta, candidateLabel, payload) {
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

    const fromType =
      typeof payload?.Type === "string" && payload.Type.trim() ? payload.Type.trim() : undefined;
    if (fromType !== undefined) {
      return fromType;
    }

    const fromNodeIdType = readTypeFromNodeId(payload?.$NodeId ?? nodeId);
    if (fromNodeIdType !== undefined) {
      return fromNodeIdType;
    }

    return defaultLabelForNodeId(nodeId);
  }

  function readTemplateId(candidateTemplateId, payload, context = metadataContext) {
    const normalizedPayloadType =
      normalizeNonEmptyString(payload?.Type) ?? readTypeFromNodeId(payload?.$NodeId);
    if (normalizedPayloadType) {
      const inferredTemplate = resolveTemplateByPayloadType(
        { ...(isObject(payload) ? payload : {}), Type: normalizedPayloadType },
        context
      );
      if (inferredTemplate) {
        return inferredTemplate.templateId;
      }
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
    const inferredPayloadType =
      normalizeNonEmptyString(payloadObject.Type) ?? readTypeFromNodeId(payloadObject.$NodeId);

    if (inferredPayloadType) {
      const templateFromType = resolveTemplateByPayloadType(
        {
          ...payloadObject,
          Type: inferredPayloadType,
        },
        context
      );
      const templateIdFromType = normalizeNonEmptyString(templateFromType?.templateId);
      if (templateIdFromType) {
        return templateIdFromType;
      }
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
            (descriptor) => normalizeNonEmptyString(descriptor?.schemaKey) === normalizedKeyHint
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

    if (inferredPayloadType) {
      return inferredPayloadType;
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

    const payloadType = normalizeNonEmptyString(payloadForTemplate?.Type);
    if (payloadType) {
      const fromType = resolveTemplateByPayloadType(payloadForTemplate, context);
      if (fromType) {
        return fromType;
      }
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
    if (normalizeNonEmptyString(normalizedPayload.Type)) {
      return normalizedPayload;
    }

    const inferredTypeFromNodeId = readTypeFromNodeId(normalizedPayload.$NodeId ?? nodeId);
    if (inferredTypeFromNodeId) {
      return {
        ...normalizedPayload,
        Type: inferredTypeFromNodeId,
      };
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
      if (normalizeNonEmptyString(rootTemplate?.schemaType)) {
        return {
          ...normalizedPayload,
          Type: rootTemplate.schemaType,
        };
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

  function resolveTemplateByPayloadType(payload, context = metadataContext) {
    const payloadType = normalizeNonEmptyString(payload?.Type);
    if (!payloadType) {
      return undefined;
    }

    const workspaceContext = context?.workspaceContext;
    const candidates = findTemplatesByTypeName(payloadType, workspaceContext);
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return findTemplateByTypeName(payloadType, workspaceContext);
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    return chooseBestTemplateCandidateForPayload(payload, candidates);
  }

  function chooseBestTemplateCandidateForPayload(payload, candidates) {
    if (!isObject(payload) || !Array.isArray(candidates) || candidates.length === 0) {
      return candidates?.[0];
    }

    const runtimePayloadKeys = Object.keys(payload).filter(
      (key) => !NODE_PAYLOAD_TEMPLATE_RESOLUTION_EXCLUDED_KEYS.has(key)
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
              .map((descriptor) => normalizeNonEmptyString(descriptor?.schemaKey))
              .filter((schemaKey) => Boolean(schemaKey))
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
