import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    EXPECTED_COMPANION_EXPORT_FORMAT_VERSION,
    getConfiguredHytaleHomePath,
    getDefaultHytaleHomePath,
    getDefaultHytaleHomeSearchPaths,
    readExportFormatVersion,
    resolveCompanionExportRootFromPatchline,
    resolvePatchlineFromWorkspace,
    resolveDataRootDir
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

    test('getDefaultHytaleHomeSearchPaths includes flatpak fallback on linux', () => {
        assert.deepStrictEqual(
            getDefaultHytaleHomeSearchPaths('linux', '/home/test'),
            [
                '/home/test/.local/share/Hytale',
                '/home/test/.var/app/com.hypixel.HytaleLauncher/data/Hytale'
            ]
        );
    });

    test('getDefaultHytaleHomePath falls back to flatpak install path on linux', () => {
        assert.strictEqual(
            getDefaultHytaleHomePath(
                'linux',
                '/home/test',
                currentPath => currentPath === '/home/test/.var/app/com.hypixel.HytaleLauncher/data/Hytale'
            ),
            '/home/test/.var/app/com.hypixel.HytaleLauncher/data/Hytale'
        );
    });

    test('getConfiguredHytaleHomePath trims and normalizes configured paths', () => {
        const config = {
            get<T>(key: string): T | undefined {
                if (key !== 'customHytalePath') {
                    return undefined;
                }
                return '  /tmp/test/../Hytale/  ' as T;
            }
        } as any;

        assert.strictEqual(
            getConfiguredHytaleHomePath(config),
            path.normalize('/tmp/test/../Hytale/')
        );
    });

    test('readExportFormatVersion reads manifest version', () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-paths-'));

        try {
            const manifestPath = path.join(workspaceRoot, 'export_manifest.json');
            fs.writeFileSync(manifestPath, JSON.stringify({ exportFormatVersion: 7 }), 'utf8');

            assert.strictEqual(readExportFormatVersion(manifestPath), 7);
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('resolveSchemaDataLocationFromPatchline uses companion export when manifest format version matches', () => {
        const globalStorageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-storage-'));
        const extensionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-extension-'));

        try {
            const exportRoot = resolveCompanionExportRootFromPatchline(globalStorageRoot, 'pre-release');
            fs.mkdirSync(exportRoot, { recursive: true });
            fs.writeFileSync(
                path.join(exportRoot, 'export_manifest.json'),
                JSON.stringify({ exportFormatVersion: EXPECTED_COMPANION_EXPORT_FORMAT_VERSION }),
                'utf8'
            );
            fs.writeFileSync(path.join(exportRoot, 'schema_mappings.json'), '{}', 'utf8');
            fs.mkdirSync(path.join(exportRoot, 'schemas'), { recursive: true });
            fs.mkdirSync(path.join(exportRoot, 'indexes'), { recursive: true });

            const location = resolveDataRootDir(
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
            const location = resolveDataRootDir(
                globalStorageRoot,
                extensionRoot,
                'release'
            );

            assert.deepStrictEqual(location, {
                rootPath: path.join(extensionRoot, 'default-data', 'export-data'),
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

            const location = resolveDataRootDir(
                globalStorageRoot,
                extensionRoot,
                'release'
            );

            assert.deepStrictEqual(location, {
                rootPath: path.join(extensionRoot, 'default-data', 'export-data'),
                source: 'default-data'
            });
        } finally {
            fs.rmSync(globalStorageRoot, { recursive: true, force: true });
            fs.rmSync(extensionRoot, { recursive: true, force: true });
        }
    });

    test('resolveSchemaDataLocationFromPatchline falls back when export manifest version is outdated', () => {
        const globalStorageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-storage-'));
        const extensionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-extension-'));

        try {
            const exportRoot = resolveCompanionExportRootFromPatchline(globalStorageRoot, 'release');
            fs.mkdirSync(exportRoot, { recursive: true });
            fs.writeFileSync(
                path.join(exportRoot, 'export_manifest.json'),
                JSON.stringify({ exportFormatVersion: EXPECTED_COMPANION_EXPORT_FORMAT_VERSION - 1 }),
                'utf8'
            );
            fs.writeFileSync(path.join(exportRoot, 'schema_mappings.json'), '{}', 'utf8');
            fs.mkdirSync(path.join(exportRoot, 'schemas'), { recursive: true });
            fs.mkdirSync(path.join(exportRoot, 'indexes'), { recursive: true });

            const location = resolveDataRootDir(
                globalStorageRoot,
                extensionRoot,
                'release'
            );

            assert.deepStrictEqual(location, {
                rootPath: path.join(extensionRoot, 'default-data', 'export-data'),
                source: 'default-data'
            });
        } finally {
            fs.rmSync(globalStorageRoot, { recursive: true, force: true });
            fs.rmSync(extensionRoot, { recursive: true, force: true });
        }
    });
});
