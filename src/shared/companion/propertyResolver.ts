import { buildPropertyKey } from './propertyIndex';
import { appendJsonPointer, decodeJsonPointer } from './schemaStore';
import { PropertyNodeData } from './types';

export function resolveSchemaPropertyPointerFromJsonPointer(
    schemaDocument: unknown,
    jsonPointerCandidate: string,
    schemaFile: string,
    propertyByKey: ReadonlyMap<string, PropertyNodeData>
): string | undefined {
    const normalizedPointer = normalizeJsonPointer(jsonPointerCandidate);
    const directKey = buildPropertyKey(schemaFile, normalizedPointer);
    if (propertyByKey.has(directKey)) {
        return normalizedPointer;
    }

    const segments = decodeJsonPointer(normalizedPointer);
    if (segments.length === 0) {
        return undefined;
    }

    let currentNode = schemaDocument;
    let schemaPointer = '';

    for (const segment of segments) {
        const next = resolveStep(currentNode, schemaPointer, segment);
        if (!next) {
            return undefined;
        }

        currentNode = next.node;
        schemaPointer = next.pointer;
    }

    const resolvedKey = buildPropertyKey(schemaFile, schemaPointer);
    return propertyByKey.has(resolvedKey) ? schemaPointer : undefined;
}

export function resolvePropertyFromSchemaAndJsonPointer(
    schemaDocument: unknown,
    schemaFile: string,
    jsonPointerCandidate: string,
    propertyByKey: ReadonlyMap<string, PropertyNodeData>
): PropertyNodeData | undefined {
    const schemaPointer = resolveSchemaPropertyPointerFromJsonPointer(
        schemaDocument,
        jsonPointerCandidate,
        schemaFile,
        propertyByKey
    );
    if (!schemaPointer) {
        return undefined;
    }

    return propertyByKey.get(buildPropertyKey(schemaFile, schemaPointer));
}

function resolveStep(
    currentNode: unknown,
    currentPointer: string,
    segment: string
): { node: unknown; pointer: string } | undefined {
    if (Array.isArray(currentNode)) {
        const arrayIndex = Number.parseInt(segment, 10);
        if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex >= currentNode.length) {
            return undefined;
        }

        return {
            node: currentNode[arrayIndex],
            pointer: appendJsonPointer(currentPointer, String(arrayIndex))
        };
    }

    if (!isRecord(currentNode)) {
        return undefined;
    }

    const propertiesCandidate = currentNode.properties;
    if (isRecord(propertiesCandidate) && Object.prototype.hasOwnProperty.call(propertiesCandidate, segment)) {
        return {
            node: propertiesCandidate[segment],
            pointer: appendJsonPointer(appendJsonPointer(currentPointer, 'properties'), segment)
        };
    }

    const compositionStep = resolveCompositionStep(currentNode, currentPointer, segment);
    if (compositionStep) {
        return compositionStep;
    }

    const itemsCandidate = currentNode.items;
    const isNumericSegment = Number.isInteger(Number.parseInt(segment, 10));
    if (isNumericSegment) {
        if (Array.isArray(itemsCandidate)) {
            const index = Number.parseInt(segment, 10);
            if (index >= 0 && index < itemsCandidate.length) {
                return {
                    node: itemsCandidate[index],
                    pointer: appendJsonPointer(appendJsonPointer(currentPointer, 'items'), String(index))
                };
            }
        } else if (isRecord(itemsCandidate)) {
            return {
                node: itemsCandidate,
                pointer: appendJsonPointer(currentPointer, 'items')
            };
        }
    }

    const additionalProperties = currentNode.additionalProperties;
    if (isRecord(additionalProperties)) {
        return {
            node: additionalProperties,
            pointer: appendJsonPointer(currentPointer, 'additionalProperties')
        };
    }

    return undefined;
}

function resolveCompositionStep(
    currentNode: Record<string, unknown>,
    currentPointer: string,
    segment: string
): { node: unknown; pointer: string } | undefined {
    const compositionFields = ['allOf', 'anyOf', 'oneOf'] as const;
    for (const fieldName of compositionFields) {
        const compositionCandidate = currentNode[fieldName];
        if (!Array.isArray(compositionCandidate)) {
            continue;
        }

        const matchingIndexes: number[] = [];
        for (let index = 0; index < compositionCandidate.length; index += 1) {
            const branch = compositionCandidate[index];
            if (!isRecord(branch)) {
                continue;
            }

            if (isRecord(branch.properties) && Object.prototype.hasOwnProperty.call(branch.properties, segment)) {
                matchingIndexes.push(index);
            }
        }

        if (matchingIndexes.length === 0) {
            continue;
        }

        const branchIndex = matchingIndexes[0];
        const branch = compositionCandidate[branchIndex] as Record<string, unknown>;
        const properties = branch.properties as Record<string, unknown>;
        return {
            node: properties[segment],
            pointer: appendJsonPointer(
                appendJsonPointer(
                    appendJsonPointer(
                        appendJsonPointer(currentPointer, fieldName),
                        String(branchIndex)
                    ),
                    'properties'
                ),
                segment
            )
        };
    }

    return undefined;
}

function normalizeJsonPointer(pointerCandidate: string): string {
    if (!pointerCandidate || pointerCandidate === '#') {
        return '';
    }

    let pointer = pointerCandidate;
    if (pointer.startsWith('#')) {
        pointer = pointer.slice(1);
    }

    if (!pointer || pointer === '/') {
        return '';
    }

    return pointer.startsWith('/') ? pointer : `/${pointer}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
