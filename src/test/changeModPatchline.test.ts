import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    detectHytaleModWorkspace,
    replaceAssetsPathInArg,
    replaceAssetsPatchlineInArg,
    replacePatchlineInGradlePropertiesContent,
    rewriteLaunchArgs
} from '../commands/changeModPatchline';

suite('Change Mod Patchline Test Suite', () => {

    test('replacePatchlineInGradlePropertiesContent swaps existing patchline', () => {
        const original = 'version=1.0.0\npatchline=release\nload_user_mods=false\n';
        const updated = replacePatchlineInGradlePropertiesContent(original, 'pre-release');
        assert.strictEqual(updated.includes('patchline=pre-release'), true);
        assert.strictEqual(updated.includes('patchline=release'), false);
    });

    test('replacePatchlineInGradlePropertiesContent appends missing patchline', () => {
        const original = 'version=1.0.0\nload_user_mods=false\n';
        const updated = replacePatchlineInGradlePropertiesContent(original, 'release');
        assert.strictEqual(updated.includes('patchline=release'), true);
    });

    test('replaceAssetsPatchlineInArg swaps assets install patchline', () => {
        const original = '--assets=/Users/test/Library/Application Support/Hytale/install/release/package/game/latest/Assets.zip';
        const updated = replaceAssetsPatchlineInArg(original, 'pre-release');
        assert.strictEqual(updated.includes('/install/pre-release/package/game/latest/Assets.zip'), true);
    });

    test('replaceAssetsPathInArg swaps the full assets install path', () => {
        const original = '--assets=/Users/test/Library/Application Support/Hytale/install/release/package/game/latest/Assets.zip';
        const updated = replaceAssetsPathInArg(
            original,
            '/Volumes/Hytale/install/pre-release/package/game/latest/Assets.zip'
        );
        assert.strictEqual(
            updated,
            '--assets=/Volumes/Hytale/install/pre-release/package/game/latest/Assets.zip'
        );
    });

    test('rewriteLaunchArgs updates the full assets path and companion mods path', () => {
        const oldCompanionPath = '/tmp/vscode-global-storage/companion/HytaleDevtoolsCompanion/build/libs';
        const desiredCompanionPath = '/Users/test/.vscode/extensions/hytale-devtools/companion-mod/build/libs';
        const desiredAssetsPath = '/Volumes/Hytale/install/pre-release/package/game/latest/Assets.zip';
        const args = [
            '--allow-op',
            '--assets=/Users/test/Library/Application Support/Hytale/install/release/package/game/latest/Assets.zip',
            '--mods=${workspaceFolder}/src/main',
            `--mods=${oldCompanionPath}`
        ];

        const rewritten = rewriteLaunchArgs(
            args,
            desiredCompanionPath,
            desiredAssetsPath
        );

        assert.strictEqual(rewritten.changed, true);
        assert.strictEqual(
            rewritten.args.includes(`--assets=${desiredAssetsPath}`),
            true
        );
        assert.strictEqual(
            rewritten.args.filter(arg => arg === `--mods=${desiredCompanionPath}`).length,
            1
        );
    });

    test('rewriteLaunchArgs removes deprecated workspace src/main mods arg', () => {
        const args = [
            '--allow-op',
            '--mods=${workspaceFolder}/src/main'
        ];

        const rewritten = rewriteLaunchArgs(
            args,
            '/Users/test/.vscode/extensions/hytale-devtools/companion-mod/build/libs',
            undefined,
            true,
            ['--mods=${workspaceFolder}/src/main']
        );

        assert.strictEqual(rewritten.changed, true);
        assert.strictEqual(rewritten.args.includes('--mods=${workspaceFolder}/src/main'), false);
        assert.strictEqual(
            rewritten.args.includes('--mods=/Users/test/.vscode/extensions/hytale-devtools/companion-mod/build/libs'),
            true
        );
    });

    test('detectHytaleModWorkspace returns true when launch.json has Hytale server mainClass', () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-mod-workspace-'));

        try {
            fs.mkdirSync(path.join(workspaceRoot, '.vscode'), { recursive: true });
            fs.writeFileSync(
                path.join(workspaceRoot, '.vscode', 'launch.json'),
                JSON.stringify({
                    version: '0.2.0',
                    configurations: [
                        {
                            type: 'java',
                            name: 'Run Hytale Server',
                            request: 'launch',
                            mainClass: 'com.hypixel.hytale.Main'
                        }
                    ]
                }, null, 4),
                'utf8'
            );

            assert.strictEqual(detectHytaleModWorkspace(workspaceRoot), true);
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('detectHytaleModWorkspace returns false when launch.json has no Hytale server mainClass', () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-mod-workspace-'));

        try {
            fs.mkdirSync(path.join(workspaceRoot, '.vscode'), { recursive: true });
            fs.writeFileSync(
                path.join(workspaceRoot, '.vscode', 'launch.json'),
                JSON.stringify({
                    version: '0.2.0',
                    configurations: [
                        {
                            type: 'java',
                            name: 'Run Something Else',
                            request: 'launch',
                            mainClass: 'org.example.Main'
                        }
                    ]
                }, null, 4),
                'utf8'
            );

            assert.strictEqual(detectHytaleModWorkspace(workspaceRoot), false);
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('detectHytaleModWorkspace returns false when launch.json is missing', () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-mod-workspace-'));

        try {
            assert.strictEqual(detectHytaleModWorkspace(workspaceRoot), false);
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

});
