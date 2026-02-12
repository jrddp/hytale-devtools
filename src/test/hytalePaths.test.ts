import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolvePatchlineFromWorkspace } from '../utils/hytalePaths';

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
});
