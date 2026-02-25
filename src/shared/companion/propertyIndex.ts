import { asHytaleDevtoolsPayload } from '../hytaleDevtoolsPayload';
import { type PropertyNodeData } from './types';
import { appendJsonPointer, escapeJsonPointerToken } from './schemaStore';

export function buildPropertyKey(schemaFile: string, jsonPointer: string): string {
    return `${schemaFile}#${jsonPointer}`;
}

export function buildPropertyIndex(schemaDocuments: Map<string, unknown>): Map<string, PropertyNodeData> {
    const index = new Map<string, PropertyNodeData>();
    for (const [schemaFile, schemaDocument] of schemaDocuments.entries()) {
        indexPropertyNodesRecursive(schemaFile, '', schemaDocument, index, new Set<object>());
    }
    return index;
}

function indexPropertyNodesRecursive(
    schemaFile: string,
    pointer: string,
    value: unknown,
    index: Map<string, PropertyNodeData>,
    recursionStack: Set<object>
): void {
    if (Array.isArray(value)) {
        if (recursionStack.has(value)) {
            return;
        }

        recursionStack.add(value);
        for (let arrayIndex = 0; arrayIndex < value.length; arrayIndex += 1) {
            indexPropertyNodesRecursive(
                schemaFile,
                appendJsonPointer(pointer, String(arrayIndex)),
                value[arrayIndex],
                index,
                recursionStack
            );
        }
        recursionStack.delete(value);
        return;
    }

    if (!isRecord(value)) {
        return;
    }

    if (recursionStack.has(value)) {
        return;
    }
    recursionStack.add(value);

    const propertiesCandidate = value.properties;
    if (isRecord(propertiesCandidate)) {
        const propertyNames = Object.keys(propertiesCandidate).sort((left, right) => left.localeCompare(right));
        for (const propertyName of propertyNames) {
            const propertyNode = propertiesCandidate[propertyName];
            if (!isRecord(propertyNode)) {
                continue;
            }

            const propertyPointer = `${appendJsonPointer(pointer, 'properties')}/${escapeJsonPointerToken(propertyName)}`;
            const propertyKey = buildPropertyKey(schemaFile, propertyPointer);
            const hytaleDevtools = asHytaleDevtoolsPayload(propertyNode.hytaleDevtools);
            index.set(propertyKey, {
                propertyKey,
                schemaFile,
                jsonPointer: propertyPointer,
                propertyName,
                node: propertyNode,
                hytaleDevtools
            });
        }
    }

    const keys = Object.keys(value).sort((left, right) => left.localeCompare(right));
    for (const key of keys) {
        indexPropertyNodesRecursive(
            schemaFile,
            appendJsonPointer(pointer, key),
            value[key],
            index,
            recursionStack
        );
    }

    recursionStack.delete(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
