export type SchemaDocs = Record<string, any>;

export type JsonMetadataPropertyMatch = {
  pointer: string;
  ref: string;
  metadata: any;
  additionalMatches?: Array<{
    ref: string;
    metadata: any;
    differingTopLevelKeys?: string[];
  }>;
};
export type JsonMetadataMatch = {
  schema: string;
  pointer: string;
  constantAssumptions?: Record<string, string>;
  ref: string | null;
  hits: any[];
  properties: Record<string, JsonMetadataPropertyMatch>;
};
export type ResolveMetadataOptions = {
  ignoreMetadataProperties?: boolean;
  ignoredProperties?: string[];
  withConstants?: Record<string, string>;
};

type TraversalCandidate = { schema: string; pointer: string; node: any };
type MetadataLocation = {
  schema: string;
  pointer: string;
  node: any;
  metadata: any;
};

const escapePointerToken = (token: string) => token.replace(/~/g, "~0").replace(/\//g, "~1");
const unescapePointerToken = (token: string) => token.replace(/~1/g, "/").replace(/~0/g, "~");

const normalizePointer = (pointer: string) =>
  !pointer || pointer === "#" || pointer === "/"
    ? ""
    : (pointer[0] === "#" ? pointer.slice(1) : pointer).replace(/^([^/])/, "/$1");

const splitPointer = (pointer: string) =>
  normalizePointer(pointer)
    ? normalizePointer(pointer).slice(1).split("/").map(unescapePointerToken)
    : [];

const joinPointer = (basePointer: string, key: string) =>
  `${normalizePointer(basePointer)}/${escapePointerToken(key)}` || `/${escapePointerToken(key)}`;

const tokensToPointer = (tokens: string[]) =>
  tokens.length ? `/${tokens.map(escapePointerToken).join("/")}` : "/";

const getNodeAtPointer = (document: any, pointer: string) =>
  splitPointer(pointer).reduce((current, segment) => current?.[segment], document);

const resolveRefTarget = (
  fromSchema: string,
  ref: string,
  docs: SchemaDocs,
): TraversalCandidate | null => {
  const hashIndex = ref.indexOf("#");
  const refFile = hashIndex === -1 ? ref : ref.slice(0, hashIndex);
  const refFragment = hashIndex === -1 ? "" : ref.slice(hashIndex + 1);
  const schema = refFile ? refFile.replace(/^.\//, "") : fromSchema;
  const pointer = refFragment ? `/${refFragment.replace(/^\//, "")}` : "";
  const node = getNodeAtPointer(docs[schema], pointer);
  return node === undefined ? null : { schema, pointer, node };
};

const uniqueBy = <T>(items: T[], key: (item: T) => string) => [
  ...new Map(items.map(item => [key(item), item])).values(),
];

const readConstValue = (node: any): any => {
  if (node?.const !== undefined) {
    return node.const;
  }
  for (const branchKey of ["allOf", "anyOf", "oneOf"] as const) {
    const branches = node?.[branchKey];
    if (Array.isArray(branches) && branches.length === 1) {
      const value = readConstValue(branches[0]);
      if (value !== undefined) {
        return value;
      }
    }
  }
  return undefined;
};

const matchesConstantAssumptions = (
  candidate: TraversalCandidate,
  withConstants: Record<string, string>,
) => {
  const pointerSegments = splitPointer(candidate.pointer);

  const nodeProperties = candidate.node?.properties;
  if (nodeProperties && typeof nodeProperties === "object") {
    for (const [propertyKey, expectedConst] of Object.entries(withConstants)) {
      const actualConst = readConstValue(nodeProperties[propertyKey]);
      if (actualConst !== undefined && actualConst !== expectedConst) {
        return false;
      }
    }
  }

  for (let i = pointerSegments.length - 2; i >= 0; i--) {
    if (pointerSegments[i] !== "properties") {
      continue;
    }
    const propertyKey = pointerSegments[i + 1];
    const expectedConst = withConstants[propertyKey];
    if (expectedConst === undefined) {
      break;
    }
    const actualConst = readConstValue(candidate.node);
    if (actualConst !== undefined && actualConst !== expectedConst) {
      return false;
    }
    break;
  }

  return true;
};

const isRefOnlyNode = (node: any) =>
  node &&
  typeof node === "object" &&
  !Array.isArray(node) &&
  Object.keys(node).length === 1 &&
  typeof node.$ref === "string";

const toOutputRef = (
  source: Pick<TraversalCandidate, "schema" | "pointer" | "node"> | undefined,
  docs: SchemaDocs,
) => {
  if (!source) {
    return null;
  }

  if (typeof source.node?.$ref === "string") {
    const resolved = resolveRefTarget(source.schema, source.node.$ref, docs);
    if (resolved) {
      return `${resolved.schema}#${resolved.pointer}`;
    }
  }

  for (const branchKey of ["allOf", "anyOf", "oneOf"] as const) {
    const branches = source.node?.[branchKey];
    if (Array.isArray(branches) && branches.length === 1 && isRefOnlyNode(branches[0])) {
      const resolved = resolveRefTarget(source.schema, branches[0].$ref, docs);
      if (resolved) {
        return `${resolved.schema}#${resolved.pointer}`;
      }
    }
  }

  return `${source.schema}#${source.pointer}`;
};

const toDefinitionRefFromPropertyRef = (propertyRef: string, propertyKey: string) => {
  const hashIndex = propertyRef.indexOf("#");
  if (hashIndex === -1) {
    return propertyRef;
  }

  const schemaPart = propertyRef.slice(0, hashIndex);
  const pointerPart = propertyRef.slice(hashIndex + 1);
  const pointerSegments = splitPointer(pointerPart);
  const propertiesIndex = pointerSegments.lastIndexOf("properties");

  if (
    propertiesIndex === -1 ||
    propertiesIndex === pointerSegments.length - 1 ||
    pointerSegments[propertiesIndex + 1] !== propertyKey
  ) {
    return propertyRef;
  }

  const definitionSegments = pointerSegments.slice(0, propertiesIndex);
  const definitionPointer = definitionSegments.length
    ? `/${definitionSegments.map(escapePointerToken).join("/")}`
    : "";
  return `${schemaPart}#${definitionPointer}`;
};

const getConstantConstrainedRef = (
  properties: JsonMetadataMatch["properties"],
  withConstants: Record<string, string>,
) => {
  const constantKeys = Object.keys(withConstants);
  if (!constantKeys.length) {
    return null;
  }

  const definitionRefs: string[] = [];
  for (const key of constantKeys) {
    const match = properties[key];
    if (!match || match.additionalMatches?.length) {
      return null;
    }
    definitionRefs.push(toDefinitionRefFromPropertyRef(match.ref, key));
  }

  const uniqueDefinitionRefs = uniqueBy(definitionRefs, ref => ref);
  return uniqueDefinitionRefs.length === 1 ? uniqueDefinitionRefs[0] : null;
};

const stepPointerSegment = (
  candidate: TraversalCandidate,
  segment: string,
  docs: SchemaDocs,
  withConstants?: Record<string, string>,
): TraversalCandidate[] => {
  if (withConstants && !matchesConstantAssumptions(candidate, withConstants)) {
    return [];
  }

  const node = candidate.node;
  const next: TraversalCandidate[] = [];

  if (node?.$ref) {
    const refTarget = resolveRefTarget(candidate.schema, node.$ref, docs);
    if (refTarget) {
      next.push(...stepPointerSegment(refTarget, segment, docs, withConstants));
    }
  }

  if (node?.properties?.[segment] !== undefined) {
    next.push({
      schema: candidate.schema,
      pointer: `${candidate.pointer}/properties/${escapePointerToken(segment)}`,
      node: node.properties[segment],
    });
  }

  if (node?.patternProperties) {
    for (const pattern of Object.keys(node.patternProperties)) {
      if (new RegExp(pattern).test(segment)) {
        next.push({
          schema: candidate.schema,
          pointer: `${candidate.pointer}/patternProperties/${escapePointerToken(pattern)}`,
          node: node.patternProperties[pattern],
        });
      }
    }
  }

  if (node?.additionalProperties && typeof node.additionalProperties === "object") {
    next.push({
      schema: candidate.schema,
      pointer: `${candidate.pointer}/additionalProperties`,
      node: node.additionalProperties,
    });
  }

  if (/^\d+$/.test(segment)) {
    const index = Number(segment);

    if (Array.isArray(node?.prefixItems) && node.prefixItems[index] !== undefined) {
      next.push({
        schema: candidate.schema,
        pointer: `${candidate.pointer}/prefixItems/${index}`,
        node: node.prefixItems[index],
      });
    }

    if (Array.isArray(node?.items) && node.items[index] !== undefined) {
      next.push({
        schema: candidate.schema,
        pointer: `${candidate.pointer}/items/${index}`,
        node: node.items[index],
      });
    } else if (node?.items && typeof node.items === "object") {
      next.push({
        schema: candidate.schema,
        pointer: `${candidate.pointer}/items`,
        node: node.items,
      });
    }

    if (
      Array.isArray(node?.items) &&
      node.items[index] === undefined &&
      node?.additionalItems &&
      typeof node.additionalItems === "object"
    ) {
      next.push({
        schema: candidate.schema,
        pointer: `${candidate.pointer}/additionalItems`,
        node: node.additionalItems,
      });
    }
  } else {
    // Allow traversing array items without explicitly including an index segment.
    // Example: "/Props/Assignments" should behave like "/Props/0/Assignments".
    if (Array.isArray(node?.prefixItems)) {
      node.prefixItems.forEach((item: any, index: number) =>
        next.push(
          ...stepPointerSegment(
            {
              schema: candidate.schema,
              pointer: `${candidate.pointer}/prefixItems/${index}`,
              node: item,
            },
            segment,
            docs,
            withConstants,
          ),
        ),
      );
    }

    if (Array.isArray(node?.items)) {
      node.items.forEach((item: any, index: number) =>
        next.push(
          ...stepPointerSegment(
            {
              schema: candidate.schema,
              pointer: `${candidate.pointer}/items/${index}`,
              node: item,
            },
            segment,
            docs,
            withConstants,
          ),
        ),
      );

      if (node?.additionalItems && typeof node.additionalItems === "object") {
        next.push(
          ...stepPointerSegment(
            {
              schema: candidate.schema,
              pointer: `${candidate.pointer}/additionalItems`,
              node: node.additionalItems,
            },
            segment,
            docs,
            withConstants,
          ),
        );
      }
    } else if (node?.items && typeof node.items === "object") {
      next.push(
        ...stepPointerSegment(
          {
            schema: candidate.schema,
            pointer: `${candidate.pointer}/items`,
            node: node.items,
          },
          segment,
          docs,
          withConstants,
        ),
      );
    }
  }

  for (const branchKey of ["allOf", "anyOf", "oneOf"] as const) {
    if (Array.isArray(node?.[branchKey])) {
      node[branchKey].forEach((branch: any, index: number) => {
        next.push(
          ...stepPointerSegment(
            {
              schema: candidate.schema,
              pointer: `${candidate.pointer}/${branchKey}/${index}`,
              node: branch,
            },
            segment,
            docs,
            withConstants,
          ),
        );
      });
    }
  }

  for (const branchKey of ["if", "then", "else"] as const) {
    if (node?.[branchKey] && typeof node[branchKey] === "object") {
      next.push(
        ...stepPointerSegment(
          {
            schema: candidate.schema,
            pointer: `${candidate.pointer}/${branchKey}`,
            node: node[branchKey],
          },
          segment,
          docs,
          withConstants,
        ),
      );
    }
  }

  return uniqueBy(next, x => `${x.schema}#${x.pointer}`);
};

const resolveCandidatesAtPointer = (docs: SchemaDocs, rootSchema: string, pointer: string) => {
  const normalizedPointer = normalizePointer(pointer);

  // hardcoded fast path for schema-definition pointers like "/definitions/Foo"
  if (
    normalizedPointer === "/definitions" ||
    normalizedPointer.startsWith("/definitions/")
  ) {
    const definitionNode = getNodeAtPointer(docs[rootSchema], normalizedPointer);
    if (definitionNode !== undefined) {
      return [{ schema: rootSchema, pointer: normalizedPointer, node: definitionNode }];
    }
  }

  let candidates: TraversalCandidate[] = [
    { schema: rootSchema, pointer: "", node: docs[rootSchema] },
  ];
  for (const segment of splitPointer(normalizedPointer)) {
    candidates = uniqueBy(
      candidates.flatMap(candidate => stepPointerSegment(candidate, segment, docs)),
      x => `${x.schema}#${x.pointer}`,
    );
  }
  return candidates;
};

const collectPropertyKeys = (
  candidates: TraversalCandidate[],
  docs: SchemaDocs,
  withConstants: Record<string, string>,
): string[] => {
  const keys = new Set<string>();
  const seen = new Set<string>();

  const walk = (candidate: TraversalCandidate) => {
    const id = `${candidate.schema}#${candidate.pointer}`;
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    if (!matchesConstantAssumptions(candidate, withConstants)) {
      return;
    }

    const node = candidate.node;

    if (node?.$ref) {
      const refTarget = resolveRefTarget(candidate.schema, node.$ref, docs);
      if (refTarget) {
        walk(refTarget);
      }
    }

    if (node?.properties && typeof node.properties === "object") {
      for (const key of Object.keys(node.properties)) {
        keys.add(key);
      }
    }

    for (const branchKey of ["allOf", "anyOf", "oneOf"] as const) {
      if (Array.isArray(node?.[branchKey])) {
        node[branchKey].forEach((branch: any, index: number) =>
          walk({
            schema: candidate.schema,
            pointer: `${candidate.pointer}/${branchKey}/${index}`,
            node: branch,
          }),
        );
      }
    }

    for (const branchKey of ["if", "then", "else"] as const) {
      if (node?.[branchKey] && typeof node[branchKey] === "object") {
        walk({
          schema: candidate.schema,
          pointer: `${candidate.pointer}/${branchKey}`,
          node: node[branchKey],
        });
      }
    }
  };

  candidates.forEach(walk);
  return [...keys];
};

const collectMetadataOnNode = (node: any, metadataKeys: string[]) => {
  const metadata = Object.fromEntries(
    metadataKeys.filter(key => node?.[key] !== undefined).map(key => [key, node[key]]),
  );
  return Object.keys(metadata).length ? metadata : null;
};

const topLevelDiffKeys = (a: Record<string, any>, b: Record<string, any>) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
};

const collectMetadataLocations = (
  candidate: TraversalCandidate,
  docs: SchemaDocs,
  metadataKeys: string[],
  withConstants: Record<string, string>,
  seen = new Set<string>(),
): MetadataLocation[] => {
  const id = `${candidate.schema}#${candidate.pointer}`;
  if (seen.has(id)) {
    return [];
  }
  seen.add(id);
  if (!matchesConstantAssumptions(candidate, withConstants)) {
    return [];
  }

  const pushFromCandidate = (nextCandidate: TraversalCandidate | null) =>
    nextCandidate
      ? collectMetadataLocations(nextCandidate, docs, metadataKeys, withConstants, seen)
      : [];

  const metadata = collectMetadataOnNode(candidate.node, metadataKeys);
  const locations: MetadataLocation[] = metadata
    ? [{ schema: candidate.schema, pointer: candidate.pointer, node: candidate.node, metadata }]
    : [];

  if (candidate.node?.$ref) {
    const refTarget = resolveRefTarget(candidate.schema, candidate.node.$ref, docs);
    locations.push(...pushFromCandidate(refTarget));
  }

  // If the current node has metadata, stop here (aside from $ref above).
  // This keeps matches focused on the closest definition level.
  if (metadata) {
    return locations;
  }

  for (const branchKey of ["allOf", "anyOf", "oneOf"] as const) {
    if (Array.isArray(candidate.node?.[branchKey])) {
      candidate.node[branchKey].forEach((branch: any, index: number) =>
        locations.push(
          ...pushFromCandidate({
            schema: candidate.schema,
            pointer: `${candidate.pointer}/${branchKey}/${index}`,
            node: branch,
          }),
        ),
      );
    }
  }

  for (const branchKey of ["if", "then", "else"] as const) {
    if (candidate.node?.[branchKey] && typeof candidate.node[branchKey] === "object") {
      locations.push(
        ...pushFromCandidate({
          schema: candidate.schema,
          pointer: `${candidate.pointer}/${branchKey}`,
          node: candidate.node[branchKey],
        }),
      );
    }
  }

  if (Array.isArray(candidate.node?.prefixItems)) {
    candidate.node.prefixItems.forEach((item: any, index: number) =>
      locations.push(
        ...pushFromCandidate({
          schema: candidate.schema,
          pointer: `${candidate.pointer}/prefixItems/${index}`,
          node: item,
        }),
      ),
    );
  }

  if (Array.isArray(candidate.node?.items)) {
    candidate.node.items.forEach((item: any, index: number) =>
      locations.push(
        ...pushFromCandidate({
          schema: candidate.schema,
          pointer: `${candidate.pointer}/items/${index}`,
          node: item,
        }),
      ),
    );
  } else if (candidate.node?.items && typeof candidate.node.items === "object") {
    locations.push(
      ...pushFromCandidate({
        schema: candidate.schema,
        pointer: `${candidate.pointer}/items`,
        node: candidate.node.items,
      }),
    );
  }

  if (
    candidate.node?.additionalProperties &&
    typeof candidate.node.additionalProperties === "object"
  ) {
    locations.push(
      ...pushFromCandidate({
        schema: candidate.schema,
        pointer: `${candidate.pointer}/additionalProperties`,
        node: candidate.node.additionalProperties,
      }),
    );
  }

  if (candidate.node?.additionalItems && typeof candidate.node.additionalItems === "object") {
    locations.push(
      ...pushFromCandidate({
        schema: candidate.schema,
        pointer: `${candidate.pointer}/additionalItems`,
        node: candidate.node.additionalItems,
      }),
    );
  }

  return locations;
};

export const resolvePointerMetadata = (
  docs: SchemaDocs,
  schema: string,
  pointer: string,
  metadataKeys: string[],
  options: ResolveMetadataOptions = {},
): JsonMetadataMatch => {
  if (!metadataKeys.length) {
    throw new Error("metadataKeys is required and must include at least one key");
  }

  const pointerForResolution = normalizePointer(pointer);
  const requestPointer = pointerForResolution || "/";
  const ignoreMetadataProperties = options.ignoreMetadataProperties ?? false;
  const ignoredProperties = new Set(options.ignoredProperties ?? []);
  const withConstants = options.withConstants ?? {};

  const candidates = resolveCandidatesAtPointer(docs, schema, pointerForResolution);
  const metadataLocations = uniqueBy(
    candidates.flatMap(candidate =>
      collectMetadataLocations(candidate, docs, metadataKeys, withConstants),
    ),
    x => `${x.schema}#${x.pointer}:${JSON.stringify(x.metadata)}`,
  );

  const hits = uniqueBy(metadataLocations, x => JSON.stringify(x.metadata)).map(x => x.metadata);
  const refSource = metadataLocations[0] ?? candidates[0];

  const properties: JsonMetadataMatch["properties"] = {};
  for (const propertyKey of collectPropertyKeys(candidates, docs, withConstants)) {
    if (ignoredProperties.has(propertyKey)) {
      continue;
    }
    if (ignoreMetadataProperties && propertyKey.startsWith("$")) {
      continue;
    }

    const propertyPointer = joinPointer(pointerForResolution, propertyKey);
    const propertyCandidates = uniqueBy(
      candidates.flatMap(candidate =>
        stepPointerSegment(candidate, propertyKey, docs, withConstants),
      ),
      x => `${x.schema}#${x.pointer}`,
    );
    const propertyMetadata = uniqueBy(
      propertyCandidates.flatMap(candidate =>
        collectMetadataLocations(candidate, docs, metadataKeys, withConstants),
      ),
      x => `${x.schema}#${x.pointer}:${JSON.stringify(x.metadata)}`,
    );

    if (!propertyMetadata.length) {
      continue;
    }

    const distinctMetadata = uniqueBy(propertyMetadata, x => JSON.stringify(x.metadata));
    const first = distinctMetadata[0];
    const additionalMatches = distinctMetadata.slice(1).map(x => {
      const differingTopLevelKeys = topLevelDiffKeys(first.metadata, x.metadata);
      return {
        ref: `${x.schema}#${x.pointer}`,
        metadata: x.metadata,
        differingTopLevelKeys: differingTopLevelKeys.length ? differingTopLevelKeys : undefined,
      };
    });

    if (distinctMetadata.length > 1) {
      const mismatchKeys = uniqueBy(
        additionalMatches.flatMap(x => x.differingTopLevelKeys ?? []),
        x => x,
      );
      const mismatchLabel = mismatchKeys.length
        ? `; differing top-level keys: ${mismatchKeys.join(", ")}`
        : "";
      console.warn(
        `[pointer-resolver-2] duplicate metadata for property "${propertyKey}" at pointer "${requestPointer}" (kept ${first.schema}#${first.pointer}, ignored ${distinctMetadata.length - 1} alternate match${distinctMetadata.length - 1 === 1 ? "" : "es"}${mismatchLabel})`,
      );
    }

    properties[propertyKey] = {
      pointer: propertyPointer,
      ref: `${first.schema}#${first.pointer}`,
      metadata: first.metadata,
      additionalMatches: additionalMatches.length ? additionalMatches : undefined,
    };
  }

  const constantConstrainedRef = getConstantConstrainedRef(properties, withConstants);

  return {
    schema,
    pointer: requestPointer,
    constantAssumptions: Object.keys(withConstants).length ? { ...withConstants } : undefined,
    ref: constantConstrainedRef ?? toOutputRef(refSource, docs),
    hits,
    properties,
  };
};

export const resolvePointerMetadataFromRef = (
  docs: SchemaDocs,
  ref: string,
  metadataKeys: string[],
  options: ResolveMetadataOptions = {},
): JsonMetadataMatch => {
  const normalizedRef = typeof ref === "string" ? ref.trim() : "";
  if (!normalizedRef) {
    throw new Error("ref is required");
  }

  const hashIndex = normalizedRef.indexOf("#");
  const schemaPart = (hashIndex === -1 ? normalizedRef : normalizedRef.slice(0, hashIndex)).replace(
    /^\.\//,
    "",
  );
  if (!schemaPart) {
    throw new Error(`ref must include a schema file name, got "${ref}"`);
  }

  const pointerPart = hashIndex === -1 ? "" : normalizedRef.slice(hashIndex + 1);
  const normalizedSchemaPointer = normalizePointer(pointerPart);

  if (
    normalizedSchemaPointer === "/definitions" ||
    normalizedSchemaPointer.startsWith("/definitions/")
  ) {
    return resolvePointerMetadata(docs, schemaPart, normalizedSchemaPointer, metadataKeys, options);
  }

  const assetPointer = schemaPointerToAssetPointer(normalizedSchemaPointer);
  return resolvePointerMetadata(docs, schemaPart, assetPointer, metadataKeys, options);
};

const schemaPointerToAssetPointer = (schemaPointer: string) => {
  const tokens = splitPointer(schemaPointer);
  if (!tokens.length) {
    return "/";
  }

  const instanceTokens: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === "definitions") {
      // /definitions/<DefinitionName>/... is schema structure, not instance data
      index += 1;
      continue;
    }

    if (token === "properties" || token === "patternProperties") {
      const propertyKey = tokens[index + 1];
      if (propertyKey !== undefined) {
        instanceTokens.push(propertyKey);
        index += 1;
      }
      continue;
    }

    if (
      token === "items" ||
      token === "prefixItems" ||
      token === "additionalProperties" ||
      token === "additionalItems"
    ) {
      // schema container keywords, not part of instance pointer path
      continue;
    }

    if (token === "allOf" || token === "anyOf" || token === "oneOf") {
      // optional branch index follows (e.g. /anyOf/0)
      if (/^\d+$/.test(tokens[index + 1] ?? "")) {
        index += 1;
      }
      continue;
    }

    if (token === "if" || token === "then" || token === "else") {
      continue;
    }

    instanceTokens.push(token);
  }

  return tokensToPointer(instanceTokens);
};
