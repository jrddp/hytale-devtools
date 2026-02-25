import * as fs from 'fs';
import * as path from 'path';
import { type LoadedIndexShard } from './types';

interface IndexShardDocument {
    hytaleVersion?: unknown;
    generatedAt?: unknown;
    indexKind?: unknown;
    key?: unknown;
    values?: unknown;
}

export async function loadIndexShardsFromDirectory(indexDirectoryPath: string): Promise<Map<string, LoadedIndexShard>> {
    const shardFiles = await collectJsonFiles(indexDirectoryPath);
    shardFiles.sort((left, right) => left.localeCompare(right));

    const result = new Map<string, LoadedIndexShard>();
    for (const shardPath of shardFiles) {
        const loadedShard = await loadIndexShard(shardPath);
        if (!loadedShard) {
            continue;
        }

        const key = createIndexShardMapKey(loadedShard.indexKind, loadedShard.key);
        result.set(key, loadedShard);
    }

    return result;
}

export function createIndexShardMapKey(indexKind: string, key: string): string {
    return `${indexKind}:${key}`;
}

async function loadIndexShard(shardPath: string): Promise<LoadedIndexShard | undefined> {
    let document: IndexShardDocument;
    try {
        const content = await fs.promises.readFile(shardPath, 'utf8');
        document = JSON.parse(content) as IndexShardDocument;
    } catch {
        return undefined;
    }

    const indexKind = typeof document.indexKind === 'string' ? document.indexKind : '';
    const key = typeof document.key === 'string' ? document.key : '';
    if (!indexKind || !key) {
        return undefined;
    }

    return {
        path: shardPath,
        indexKind,
        key,
        values: document.values,
        hytaleVersion: typeof document.hytaleVersion === 'string' ? document.hytaleVersion : undefined,
        generatedAt: typeof document.generatedAt === 'string' ? document.generatedAt : undefined
    };
}

async function collectJsonFiles(directoryPath: string): Promise<string[]> {
    let entries: fs.Dirent[];
    try {
        entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    } catch {
        return [];
    }

    const jsonFiles: string[] = [];
    for (const entry of entries) {
        const fullPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            const childFiles = await collectJsonFiles(fullPath);
            jsonFiles.push(...childFiles);
            continue;
        }

        if (entry.isFile() && entry.name.endsWith('.json')) {
            jsonFiles.push(fullPath);
        }
    }

    return jsonFiles;
}
