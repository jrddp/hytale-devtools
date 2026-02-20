import * as assert from 'assert';
import * as path from 'path';
import { resolveCompanionExportRootFromPatchline, toSupportedPatchline } from '../shared/companion/exportRoot';

suite('Companion Export Root Test Suite', () => {
    test('toSupportedPatchline keeps pre-release and defaults unknown values to release', () => {
        assert.strictEqual(toSupportedPatchline('pre-release'), 'pre-release');
        assert.strictEqual(toSupportedPatchline('release'), 'release');
        assert.strictEqual(toSupportedPatchline('experimental'), 'release');
    });

    test('resolveCompanionExportRootFromPatchline builds expected path', () => {
        const globalStorage = path.join('/tmp', 'global-storage');
        assert.strictEqual(
            resolveCompanionExportRootFromPatchline(globalStorage, 'release'),
            path.join(globalStorage, 'release')
        );
        assert.strictEqual(
            resolveCompanionExportRootFromPatchline(globalStorage, 'pre-release'),
            path.join(globalStorage, 'pre-release')
        );
    });
});
