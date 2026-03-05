import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    resolveCompanionExportRootFromPatchline,
    resolvePatchlineFromWorkspace,
    resolveSchemaDataLocationFromPatchline
} from '../utils/hytalePaths';

suite('Hytale Paths Test Suite', () => {

    test('resolvePatchlineFromWorkspace returns release when gradle.properties is missing', () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-paths-'));

        try {
            assert.strictEqual(resolvePatchlineFromWorkspace(workspaceRoot), 'release');
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('resolvePatchlineFromWorkspace reads patchline from gradle.properties', () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-paths-'));

        try {
            fs.writeFileSync(path.join(workspaceRoot, 'gradle.properties'), 'modVersion=1.0.0\npatchline=pre-release\n', 'utf8');
            assert.strictEqual(resolvePatchlineFromWorkspace(workspaceRoot), 'pre-release');
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('resolvePatchlineFromWorkspace trims patchline values', () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-paths-'));

        try {
            fs.writeFileSync(path.join(workspaceRoot, 'gradle.properties'), 'patchline =  release  \n', 'utf8');
            assert.strictEqual(resolvePatchlineFromWorkspace(workspaceRoot), 'release');
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('resolveSchemaDataLocationFromPatchline uses companion export when schema mappings exist', () => {
        const globalStorageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-storage-'));
        const extensionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-extension-'));

        try {
            const exportRoot = resolveCompanionExportRootFromPatchline(globalStorageRoot, 'pre-release');
            fs.mkdirSync(exportRoot, { recursive: true });
            fs.writeFileSync(path.join(exportRoot, 'export_manifest.json'), '{}', 'utf8');
            fs.writeFileSync(path.join(exportRoot, 'schema_mappings.json'), '{}', 'utf8');
            fs.mkdirSync(path.join(exportRoot, 'schemas'), { recursive: true });
            fs.mkdirSync(path.join(exportRoot, 'indexes'), { recursive: true });

            const location = resolveSchemaDataLocationFromPatchline(
                globalStorageRoot,
                extensionRoot,
                'pre-release'
            );

            assert.deepStrictEqual(location, {
                rootPath: exportRoot,
                source: 'companion-export'
            });
        } finally {
            fs.rmSync(globalStorageRoot, { recursive: true, force: true });
            fs.rmSync(extensionRoot, { recursive: true, force: true });
        }
    });

    test('resolveSchemaDataLocationFromPatchline falls back to bundled default data when export is missing', () => {
        const globalStorageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-storage-'));
        const extensionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-extension-'));

        try {
            const location = resolveSchemaDataLocationFromPatchline(
                globalStorageRoot,
                extensionRoot,
                'release'
            );

            assert.deepStrictEqual(location, {
                rootPath: path.join(extensionRoot, 'default-data', 'schema-data'),
                source: 'default-data'
            });
        } finally {
            fs.rmSync(globalStorageRoot, { recursive: true, force: true });
            fs.rmSync(extensionRoot, { recursive: true, force: true });
        }
    });

    test('resolveSchemaDataLocationFromPatchline falls back when export is incomplete', () => {
        const globalStorageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-storage-'));
        const extensionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-extension-'));

        try {
            const exportRoot = resolveCompanionExportRootFromPatchline(globalStorageRoot, 'release');
            fs.mkdirSync(exportRoot, { recursive: true });
            fs.writeFileSync(path.join(exportRoot, 'schema_mappings.json'), '{}', 'utf8');
            fs.mkdirSync(path.join(exportRoot, 'schemas'), { recursive: true });
            fs.mkdirSync(path.join(exportRoot, 'indexes'), { recursive: true });

            const location = resolveSchemaDataLocationFromPatchline(
                globalStorageRoot,
                extensionRoot,
                'release'
            );

            assert.deepStrictEqual(location, {
                rootPath: path.join(extensionRoot, 'default-data', 'schema-data'),
                source: 'default-data'
            });
        } finally {
            fs.rmSync(globalStorageRoot, { recursive: true, force: true });
            fs.rmSync(extensionRoot, { recursive: true, force: true });
        }
    });
});
