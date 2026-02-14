<script>
  import { onMount } from "svelte";
  import { SvelteFlowProvider } from "@xyflow/svelte";
  import Flow from "./Flow.svelte";

  export let vscode;

  const NODE_EDITOR_METADATA_KEY = "$NodeEditorMetadata";
  const METADATA_RESERVED_KEYS = [
    "$WorkspaceID",
    "$Nodes",
    "$FloatingNodes",
    "$Links",
    "$Groups",
    "$Comments",
  ];
  const LEGACY_INLINE_ROOT_METADATA_KEYS = ["$WorkspaceID", "$Groups", "$Comments"];

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

      try {
        const parsedState = parseDocumentText(incomingText);
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

  function parseDocumentText(text) {
    if (!text.trim()) {
      return buildStateFromMetadataDocument({}, {});
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
    if (!hasMetadataContainer && (Array.isArray(parsed.nodes) || Array.isArray(parsed.edges))) {
      return buildStateFromLegacyFlowDocument(parsed);
    }

    if (!hasMetadataContainer && looksLikeLegacyInlineTemplate(parsed)) {
      return buildStateFromLegacyInlineTemplateDocument(parsed);
    }

    const metadataRoot = hasMetadataContainer ? parsed[NODE_EDITOR_METADATA_KEY] : {};
    const runtime = omitKeys(parsed, [NODE_EDITOR_METADATA_KEY]);
    return buildStateFromMetadataDocument(runtime, metadataRoot);
  }

  function buildStateFromMetadataDocument(runtime, metadataRoot) {
    const runtimeNodePayloadById = collectRuntimeNodePayloadById(runtime);
    const runtimeTreeNodeIds = new Set(Object.keys(runtimeNodePayloadById));
    const context = parseMetadataContext(metadataRoot, runtimeNodePayloadById, runtimeTreeNodeIds);
    let flowState = buildFlowStateFromMetadata(context);

    if (flowState.nodes.length === 0) {
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

  function buildStateFromLegacyFlowDocument(root) {
    const runtime = omitKeys(root, ["nodes", "edges", NODE_EDITOR_METADATA_KEY]);
    const context = createEmptyMetadataContext();
    const nextNodes = [];
    const nextEdges = [];
    const seenNodeIds = new Set();
    const candidateNodes = Array.isArray(root.nodes) ? root.nodes : [];

    for (let index = 0; index < candidateNodes.length; index += 1) {
      const candidate = candidateNodes[index];
      const nodeId = normalizeNodeId(candidate?.id, candidate?.type, index);
      if (seenNodeIds.has(nodeId)) {
        continue;
      }

      seenNodeIds.add(nodeId);

      const position = normalizePosition(candidate?.position, index);
      const label =
        typeof candidate?.data?.label === "string" && candidate.data.label.trim()
          ? candidate.data.label.trim()
          : defaultLabelForNodeId(nodeId);
      const comment =
        typeof candidate?.data?.$comment === "string" && candidate.data.$comment.trim()
          ? candidate.data.$comment.trim()
          : undefined;

      context.nodeMetadataById[nodeId] = {
        $Position: { $x: position.x, $y: position.y },
      };

      if (label !== defaultLabelForNodeId(nodeId)) {
        context.nodeMetadataById[nodeId].$Title = label;
      }

      const payload = isObject(candidate?.data?.$nodePayload) ? { ...candidate.data.$nodePayload } : {};
      payload.$NodeId = nodeId;
      if (comment !== undefined) {
        payload.$Comment = comment;
      }
      context.nodePayloadById[nodeId] = payload;

      nextNodes.push({
        id: nodeId,
        data: {
          label,
          ...(comment !== undefined ? { $comment: comment } : {}),
        },
        position,
      });
    }

    const candidateEdges = Array.isArray(root.edges) ? root.edges : [];
    for (let index = 0; index < candidateEdges.length; index += 1) {
      const candidate = candidateEdges[index];
      const source = typeof candidate?.source === "string" ? candidate.source : undefined;
      const target = typeof candidate?.target === "string" ? candidate.target : undefined;
      if (!source || !target || !seenNodeIds.has(source) || !seenNodeIds.has(target)) {
        continue;
      }

      const edgeId =
        typeof candidate?.id === "string" && candidate.id.trim()
          ? candidate.id.trim()
          : `${source}--${target}`;

      context.linkById[edgeId] = {
        $SourceNodeId: source,
        $TargetNodeId: target,
      };

      nextEdges.push({
        id: edgeId,
        source,
        target,
      });
    }

    if (nextNodes.length === 0) {
      const fallbackNode = createDefaultFlowNode();
      nextNodes.push(fallbackNode);
      context.nodeMetadataById[fallbackNode.id] = {
        $Position: {
          $x: fallbackNode.position.x,
          $y: fallbackNode.position.y,
        },
      };
      context.nodePayloadById[fallbackNode.id] = {
        $NodeId: fallbackNode.id,
      };
    }

    const serialized = buildSerializedState({
      nodes: nextNodes,
      edges: nextEdges,
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

  function buildStateFromLegacyInlineTemplateDocument(root) {
    const context = createEmptyMetadataContext();
    context.workspaceId = typeof root.$WorkspaceID === "string" ? root.$WorkspaceID : undefined;
    context.groups = Array.isArray(root.$Groups) ? root.$Groups : [];
    context.comments = Array.isArray(root.$Comments) ? root.$Comments : [];

    const runtimeTemplateRoot = omitKeys(root, LEGACY_INLINE_ROOT_METADATA_KEYS);
    const conversion = convertLegacyInlineRuntimeTree(runtimeTemplateRoot);
    context.nodeMetadataById = conversion.nodeMetadataById;
    context.nodePayloadById = conversion.nodePayloadById;
    context.runtimeTreeNodeIds = conversion.runtimeTreeNodeIds;

    const runtime = isObject(conversion.runtimeRoot) ? conversion.runtimeRoot : {};
    const flowState = {
      nodes: conversion.flowNodes,
      edges: [],
    };

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

  function convertLegacyInlineRuntimeTree(runtimeRootCandidate) {
    const nodeMetadataById = {};
    const nodePayloadById = {};
    const runtimeTreeNodeIds = new Set();
    const flowNodes = [];

    let fallbackIndex = 0;

    const visit = (candidate, keyHint, forceNode = false) => {
      if (Array.isArray(candidate)) {
        return candidate.map((item, index) => visit(item, `${keyHint}${index}`, false));
      }

      if (!isObject(candidate)) {
        return candidate;
      }

      const shouldBeNode =
        forceNode ||
        (typeof candidate.$NodeId === "string" && candidate.$NodeId.trim()) ||
        isPositionCandidate(candidate.$Position);

      if (!shouldBeNode) {
        return Object.fromEntries(
          Object.entries(candidate).map(([childKey, childValue]) => [
            childKey,
            visit(childValue, childKey, false),
          ])
        );
      }

      const nodeIndex = fallbackIndex;
      fallbackIndex += 1;
      const typeHint =
        typeof candidate.Type === "string" && candidate.Type.trim() ? candidate.Type.trim() : keyHint;
      const nodeId = normalizeNodeId(candidate.$NodeId, typeHint, nodeIndex);
      const position = normalizePosition(candidate.$Position, nodeIndex);
      const title =
        typeof candidate.$Title === "string" && candidate.$Title.trim() ? candidate.$Title.trim() : undefined;
      const comment =
        typeof candidate.$Comment === "string" && candidate.$Comment.trim()
          ? candidate.$Comment.trim()
          : undefined;

      const transformedNode = {};
      for (const [childKey, childValue] of Object.entries(candidate)) {
        if (childKey === "$NodeId" || childKey === "$Position" || childKey === "$Title") {
          continue;
        }

        transformedNode[childKey] = visit(childValue, childKey, false);
      }
      transformedNode.$NodeId = nodeId;

      nodeMetadataById[nodeId] = {
        $Position: {
          $x: position.x,
          $y: position.y,
        },
        ...(title ? { $Title: title } : {}),
      };
      nodePayloadById[nodeId] = transformedNode;
      runtimeTreeNodeIds.add(nodeId);
      flowNodes.push({
        id: nodeId,
        data: {
          label: readNodeLabel(nodeId, nodeMetadataById[nodeId], undefined, transformedNode),
          ...(comment !== undefined ? { $comment: comment } : {}),
        },
        position,
      });

      return transformedNode;
    };

    const runtimeRoot = visit(runtimeRootCandidate, "Root", true);

    if (flowNodes.length === 0) {
      const fallbackNode = createDefaultFlowNode();
      runtimeTreeNodeIds.add(fallbackNode.id);
      nodeMetadataById[fallbackNode.id] = {
        $Position: {
          $x: fallbackNode.position.x,
          $y: fallbackNode.position.y,
        },
      };
      nodePayloadById[fallbackNode.id] = {
        $NodeId: fallbackNode.id,
      };
      flowNodes.push(fallbackNode);
    }

    return {
      runtimeRoot,
      nodeMetadataById,
      nodePayloadById,
      runtimeTreeNodeIds,
      flowNodes,
    };
  }

  function createMetadataContextWithDefaultNode(context) {
    const nextContext = {
      ...context,
      nodeMetadataById: { ...context.nodeMetadataById },
      nodePayloadById: { ...context.nodePayloadById },
    };

    const fallbackNode = createDefaultFlowNode();
    nextContext.nodeMetadataById[fallbackNode.id] = {
      $Position: {
        $x: fallbackNode.position.x,
        $y: fallbackNode.position.y,
      },
    };
    nextContext.nodePayloadById[fallbackNode.id] = {
      $NodeId: fallbackNode.id,
    };

    return nextContext;
  }

  function buildFlowStateFromMetadata(context) {
    const nodeIds = new Set([
      ...Object.keys(context.nodeMetadataById),
      ...Object.keys(context.nodePayloadById),
    ]);

    const parsedEdges = [];
    for (const [linkId, linkValue] of Object.entries(context.linkById)) {
      const parsedEdge = parseEdgeFromLink(linkId, linkValue);
      if (!parsedEdge) {
        continue;
      }

      parsedEdges.push(parsedEdge);
      nodeIds.add(parsedEdge.source);
      nodeIds.add(parsedEdge.target);
    }

    const flowNodes = [];
    const sortedNodeIds = Array.from(nodeIds).sort();
    for (let index = 0; index < sortedNodeIds.length; index += 1) {
      const nodeId = sortedNodeIds[index];
      const nodeMeta = isObject(context.nodeMetadataById[nodeId])
        ? context.nodeMetadataById[nodeId]
        : {};
      const payload = isObject(context.nodePayloadById[nodeId])
        ? context.nodePayloadById[nodeId]
        : {};
      const position = normalizePosition(nodeMeta?.$Position, index);
      const label = readNodeLabel(nodeId, nodeMeta, undefined, payload);
      const comment =
        typeof payload.$Comment === "string" && payload.$Comment.trim()
          ? payload.$Comment.trim()
          : undefined;

      flowNodes.push({
        id: nodeId,
        data: {
          label,
          ...(comment !== undefined ? { $comment: comment } : {}),
        },
        position,
      });
    }

    return {
      nodes: flowNodes,
      edges: parsedEdges,
    };
  }

  function parseMetadataContext(
    metadataRoot,
    runtimeNodePayloadById = {},
    runtimeTreeNodeIds = new Set()
  ) {
    const context = createEmptyMetadataContext();
    context.workspaceId = metadataRoot.$WorkspaceID;
    context.groups = Array.isArray(metadataRoot.$Groups) ? metadataRoot.$Groups : [];
    context.comments = Array.isArray(metadataRoot.$Comments) ? metadataRoot.$Comments : [];
    context.floatingNodes = Array.isArray(metadataRoot.$FloatingNodes) ? metadataRoot.$FloatingNodes : [];
    context.metadataExtraFields = omitKeys(metadataRoot, METADATA_RESERVED_KEYS);
    context.nodePayloadById = { ...runtimeNodePayloadById };
    context.runtimeTreeNodeIds = runtimeTreeNodeIds;

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

    const linksRoot = isObject(metadataRoot.$Links) ? metadataRoot.$Links : {};
    for (const [linkId, linkValue] of Object.entries(linksRoot)) {
      if (typeof linkId !== "string" || !linkId || !isObject(linkValue)) {
        continue;
      }
      context.linkById[linkId] = { ...linkValue };
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

    const normalizedNodes = [];
    const nextNodeMetadataById = {};
    const nextNodePayloadById = {};
    const seenNodeIds = new Set();

    const inputNodes = Array.isArray(state.nodes) ? state.nodes : [];
    for (let index = 0; index < inputNodes.length; index += 1) {
      const candidate = inputNodes[index];
      const nodeId = normalizeNodeId(candidate?.id, candidate?.type, index);
      if (seenNodeIds.has(nodeId)) {
        continue;
      }
      seenNodeIds.add(nodeId);

      const baseMeta = isObject(knownNodeMetadata[nodeId]) ? { ...knownNodeMetadata[nodeId] } : {};
      const basePayload = isObject(knownNodePayload[nodeId]) ? { ...knownNodePayload[nodeId] } : {};
      const position = normalizePosition(candidate?.position, index);
      const label = readNodeLabel(nodeId, baseMeta, candidate?.data?.label);
      const comment =
        typeof candidate?.data?.$comment === "string" && candidate.data.$comment.trim()
          ? candidate.data.$comment.trim()
          : undefined;

      baseMeta.$Position = {
        $x: position.x,
        $y: position.y,
      };

      if (label !== defaultLabelForNodeId(nodeId) || typeof baseMeta.$Title === "string") {
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

      nextNodeMetadataById[nodeId] = baseMeta;
      nextNodePayloadById[nodeId] = basePayload;
      normalizedNodes.push({
        id: nodeId,
        data: {
          label,
          ...(comment !== undefined ? { $comment: comment } : {}),
        },
        position,
      });
    }

    if (normalizedNodes.length === 0) {
      const fallbackNode = createDefaultFlowNode();
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
          },
        },
      };

      return buildSerializedState({
        ...state,
        nodes: [fallbackNode],
        metadataContext: fallbackContext,
      });
    }

    const nodeIdSet = new Set(normalizedNodes.map((node) => node.id));
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

      preservedFloatingRoots.push(floatingRoot);
      collectNodeIdsFromPayload(floatingRoot, floatingCoveredNodeIds);
    }

    for (const normalizedNode of normalizedNodes) {
      const nodeId = normalizedNode.id;
      if (runtimeTreeNodeIds.has(nodeId) || floatingCoveredNodeIds.has(nodeId)) {
        continue;
      }

      const fallbackType =
        typeof normalizedNode?.data?.label === "string" && normalizedNode.data.label.trim()
          ? normalizedNode.data.label.trim()
          : defaultLabelForNodeId(nodeId);
      const existingPayload = isObject(nextNodePayloadById[nodeId]) ? nextNodePayloadById[nodeId] : {};
      const newFloatingRoot = {
        ...existingPayload,
        $NodeId: nodeId,
      };
      if (typeof newFloatingRoot.Type !== "string" && fallbackType) {
        newFloatingRoot.Type = fallbackType;
      }

      preservedFloatingRoots.push(newFloatingRoot);
      collectNodeIdsFromPayload(newFloatingRoot, floatingCoveredNodeIds);
      nextNodePayloadById[nodeId] = newFloatingRoot;
    }

    const normalizedEdges = [];
    const nextLinks = {};
    const seenEdgeIds = new Set();
    const inputEdges = Array.isArray(state.edges) ? state.edges : [];

    for (let index = 0; index < inputEdges.length; index += 1) {
      const candidate = inputEdges[index];
      const source = typeof candidate?.source === "string" ? candidate.source : undefined;
      const target = typeof candidate?.target === "string" ? candidate.target : undefined;
      if (!source || !target || !nodeIdSet.has(source) || !nodeIdSet.has(target)) {
        continue;
      }

      const edgeId =
        typeof candidate?.id === "string" && candidate.id.trim()
          ? candidate.id.trim()
          : `${source}--${target}`;

      if (seenEdgeIds.has(edgeId)) {
        continue;
      }
      seenEdgeIds.add(edgeId);

      const baseLink = isObject(knownLinks[edgeId]) ? { ...knownLinks[edgeId] } : {};
      baseLink.$SourceNodeId = source;
      baseLink.$TargetNodeId = target;

      nextLinks[edgeId] = baseLink;
      normalizedEdges.push({
        id: edgeId,
        source,
        target,
      });
    }

    const nextMetadataContext = {
      workspaceId: state.metadataContext.workspaceId,
      groups: Array.isArray(state.metadataContext.groups) ? state.metadataContext.groups : [],
      comments: Array.isArray(state.metadataContext.comments) ? state.metadataContext.comments : [],
      floatingNodes: preservedFloatingRoots,
      runtimeTreeNodeIds,
      metadataExtraFields: isObject(state.metadataContext.metadataExtraFields)
        ? state.metadataContext.metadataExtraFields
        : {},
      nodeMetadataById: nextNodeMetadataById,
      nodePayloadById: nextNodePayloadById,
      linkById: nextLinks,
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

    const root = {
      ...state.runtimeFields,
      [NODE_EDITOR_METADATA_KEY]: metadata,
    };

    return {
      nodes: normalizedNodes,
      edges: normalizedEdges,
      metadataContext: nextMetadataContext,
      text: `${JSON.stringify(root, null, 2)}\n`,
    };
  }

  function parseEdgeFromLink(linkId, linkValue) {
    const sourceCandidates = [
      linkValue.$SourceNodeId,
      linkValue.source,
      linkValue.Source,
      linkValue.from,
      linkValue.From,
    ];
    const targetCandidates = [
      linkValue.$TargetNodeId,
      linkValue.target,
      linkValue.Target,
      linkValue.to,
      linkValue.To,
    ];

    let source = sourceCandidates.find((candidate) => typeof candidate === "string" && candidate.trim());
    let target = targetCandidates.find((candidate) => typeof candidate === "string" && candidate.trim());

    if ((!source || !target) && linkId.includes("--")) {
      const [sourceFromId, targetFromId] = linkId.split("--");
      source = source ?? sourceFromId;
      target = target ?? targetFromId;
    }

    if (!source || !target) {
      return undefined;
    }

    return {
      id: linkId,
      source,
      target,
    };
  }

  function createEmptyMetadataContext() {
    return {
      workspaceId: undefined,
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

  function createDefaultFlowNode() {
    const nodeId = "Node-00000000-0000-0000-0000-000000000000";
    return {
      id: nodeId,
      data: { label: defaultLabelForNodeId(nodeId) },
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

    return defaultLabelForNodeId(nodeId);
  }

  function defaultLabelForNodeId(nodeId) {
    if (typeof nodeId !== "string" || !nodeId.trim()) {
      return "Node";
    }

    const [prefix, suffix] = nodeId.split("-", 2);
    if (prefix && suffix) {
      return prefix;
    }

    return nodeId;
  }

  function normalizeNodeId(candidate, typeHint, index) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }

    const cleanType =
      typeof typeHint === "string" && typeHint.trim()
        ? typeHint.trim().replace(/[^A-Za-z0-9_]/g, "")
        : "Node";
    return `${cleanType || "Node"}-${createUuid()}`;
  }

  function normalizePosition(candidatePosition, index) {
    const fallbackX = index * 180;
    const fallbackY = 100;
    const x = Number(candidatePosition?.x);
    const y = Number(candidatePosition?.y);
    const metaX = Number(candidatePosition?.$x);
    const metaY = Number(candidatePosition?.$y);

    return {
      x: Number.isFinite(x) ? x : Number.isFinite(metaX) ? metaX : fallbackX,
      y: Number.isFinite(y) ? y : Number.isFinite(metaY) ? metaY : fallbackY,
    };
  }

  function omitKeys(source, keysToOmit) {
    if (!isObject(source)) {
      return {};
    }

    const omitSet = new Set(keysToOmit);
    return Object.fromEntries(Object.entries(source).filter(([key]) => !omitSet.has(key)));
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isPositionCandidate(value) {
    if (!isObject(value)) {
      return false;
    }

    return Number.isFinite(Number(value.$x)) || Number.isFinite(Number(value.$y));
  }

  function looksLikeLegacyInlineTemplate(root) {
    if (!isObject(root)) {
      return false;
    }

    if (
      Number.isFinite(Number(root?.$Position?.$x)) ||
      Number.isFinite(Number(root?.$Position?.$y))
    ) {
      return true;
    }

    if (typeof root.$Title === "string" && root.$Title.trim()) {
      return true;
    }

    let foundInlinePosition = false;
    const scan = (candidate) => {
      if (foundInlinePosition) {
        return;
      }

      if (Array.isArray(candidate)) {
        for (const item of candidate) {
          scan(item);
          if (foundInlinePosition) {
            return;
          }
        }
        return;
      }

      if (!isObject(candidate)) {
        return;
      }

      if (isPositionCandidate(candidate.$Position)) {
        foundInlinePosition = true;
        return;
      }

      for (const [key, value] of Object.entries(candidate)) {
        if (key === NODE_EDITOR_METADATA_KEY || key === "$Groups") {
          continue;
        }
        scan(value);
        if (foundInlinePosition) {
          return;
        }
      }
    };

    scan(root);
    return foundInlinePosition;
  }

  function collectRuntimeNodePayloadById(runtimeRoot) {
    const payloadById = {};

    const visit = (candidate) => {
      if (Array.isArray(candidate)) {
        for (const item of candidate) {
          visit(item);
        }
        return;
      }

      if (!isObject(candidate)) {
        return;
      }

      const nodeId =
        typeof candidate.$NodeId === "string" && candidate.$NodeId.trim()
          ? candidate.$NodeId.trim()
          : undefined;

      if (nodeId && !isObject(payloadById[nodeId])) {
        payloadById[nodeId] = candidate;
      }

      for (const [key, value] of Object.entries(candidate)) {
        if (key === NODE_EDITOR_METADATA_KEY) {
          continue;
        }
        visit(value);
      }
    };

    visit(runtimeRoot);
    return payloadById;
  }

  function collectNodeIdsFromPayload(rootPayload, collectedIds) {
    const visit = (candidate) => {
      if (Array.isArray(candidate)) {
        for (const item of candidate) {
          visit(item);
        }
        return;
      }

      if (!isObject(candidate)) {
        return;
      }

      const nodeId =
        typeof candidate.$NodeId === "string" && candidate.$NodeId.trim()
          ? candidate.$NodeId.trim()
          : undefined;
      if (nodeId) {
        collectedIds.add(nodeId);
      }

      for (const [key, value] of Object.entries(candidate)) {
        if (key === NODE_EDITOR_METADATA_KEY) {
          continue;
        }
        visit(value);
      }
    };

    visit(rootPayload);
  }

  function createUuid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return Math.random().toString(16).slice(2);
  }
</script>

<main class="flex flex-col h-screen min-h-0 p-3">
  {#if extensionError}
    <div class="mb-2 text-sm text-[var(--vscode-errorForeground)]">{extensionError}</div>
  {/if}
  <SvelteFlowProvider>
    <Flow bind:nodes bind:edges loadVersion={graphLoadVersion} on:flowchange={handleFlowChange} />
  </SvelteFlowProvider>
</main>
