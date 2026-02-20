import * as fs from 'fs';
import * as path from 'path';

type RefParserInstance = {
    dereference: (path: string, options?: unknown) => Promise<unknown>;
};

type RefParserConstructor = new () => RefParserInstance;

let refParserModulePromise: Promise<unknown> | undefined;

export async function loadRawSchemasFromDirectory(schemaDirectoryPath: string): Promise<Map<string, unknown>> {
    const schemaFileNames = await listJsonFileNames(schemaDirectoryPath);
    const schemas = new Map<string, unknown>();

    for (const fileName of schemaFileNames) {
        const fullPath = path.join(schemaDirectoryPath, fileName);
        const document = await loadJsonDocument(fullPath);
        schemas.set(fileName, document);
    }

    return schemas;
}

export async function loadResolvedSchemasFromDirectory(schemaDirectoryPath: string): Promise<Map<string, unknown>> {
    const schemaFileNames = await listJsonFileNames(schemaDirectoryPath);
    const schemas = new Map<string, unknown>();

    for (const fileName of schemaFileNames) {
        const fullPath = path.join(schemaDirectoryPath, fileName);
        const parser = await createRefParser();
        const resolved = await parser.dereference(fullPath, {
            resolve: {
                http: false
            },
            dereference: {
                circular: 'ignore'
            }
        });
        schemas.set(fileName, resolved);
    }

    return schemas;
}

export function resolveJsonPointer(root: unknown, pointerCandidate: string): unknown {
    if (pointerCandidate.length === 0 || pointerCandidate === '#') {
        return root;
    }

    let pointer = pointerCandidate;
    if (pointer.startsWith('#')) {
        pointer = pointer.slice(1);
    }
    if (pointer.length === 0) {
        return root;
    }
    if (!pointer.startsWith('/')) {
        return undefined;
    }

    const segments = pointer.slice(1).split('/').map(unescapeJsonPointerToken);
    let current = root;
    for (const segment of segments) {
        if (Array.isArray(current)) {
            const index = Number.parseInt(segment, 10);
            if (!Number.isInteger(index) || index < 0 || index >= current.length) {
                return undefined;
            }
            current = current[index];
            continue;
        }

        if (isRecord(current)) {
            current = current[segment];
            continue;
        }

        return undefined;
    }

    return current;
}

export function appendJsonPointer(pointer: string, token: string): string {
    if (!pointer) {
        return `/${escapeJsonPointerToken(token)}`;
    }
    return `${pointer}/${escapeJsonPointerToken(token)}`;
}

export function decodeJsonPointer(pointerCandidate: string): string[] {
    if (!pointerCandidate || pointerCandidate === '#') {
        return [];
    }

    let pointer = pointerCandidate;
    if (pointer.startsWith('#')) {
        pointer = pointer.slice(1);
    }

    if (!pointer || pointer === '/') {
        return [];
    }

    const trimmed = pointer.startsWith('/') ? pointer.slice(1) : pointer;
    if (!trimmed) {
        return [];
    }

    return trimmed.split('/').map(unescapeJsonPointerToken);
}

export function escapeJsonPointerToken(token: string): string {
    return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapeJsonPointerToken(token: string): string {
    return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

async function createRefParser(): Promise<RefParserInstance> {
    const moduleValue = await loadRefParserModule();
    const parserConstructor = (moduleValue.$RefParser ?? moduleValue.default ?? moduleValue) as RefParserConstructor;
    return new parserConstructor() as RefParserInstance;
}

async function loadRefParserModule(): Promise<Record<string, unknown>> {
    if (!refParserModulePromise) {
        refParserModulePromise = import('@apidevtools/json-schema-ref-parser');
    }

    return await refParserModulePromise as Record<string, unknown>;
}

async function listJsonFileNames(schemaDirectoryPath: string): Promise<string[]> {
    const entries = await fs.promises.readdir(schemaDirectoryPath, { withFileTypes: true });
    const fileNames = entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(entry => entry.name)
        .sort((left, right) => left.localeCompare(right));
    return fileNames;
}

async function loadJsonDocument(filePath: string): Promise<unknown> {
    const content = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(content) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
