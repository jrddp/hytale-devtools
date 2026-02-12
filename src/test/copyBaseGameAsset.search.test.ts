import * as assert from 'assert';
import {
    buildAssetFileSearchText,
    buildStoreSearchText,
    matchesAllSearchTerms,
    tokenizeSearchQuery
} from '../commands/copyBaseGameAsset';

suite('Copy Base Game Asset Search Test Suite', () => {

    test('matches multi-term path fragments in any order', () => {
        const searchableText = buildAssetFileSearchText(
            {
                relativePath: 'NPC/Roles/Mosshorn.json',
                archiveRelativePath: 'Server/NPC/Roles/Mosshorn.json'
            },
            'Mosshorn.json',
            'NPC Roles',
            'Server/NPC/Roles/Mosshorn.json'
        );

        assert.strictEqual(matchesAllSearchTerms(searchableText, tokenizeSearchQuery('mosshorn role')), true);
        assert.strictEqual(matchesAllSearchTerms(searchableText, tokenizeSearchQuery('role mosshorn')), true);
    });

    test('matches partial term in path segment', () => {
        const searchableText = buildAssetFileSearchText(
            {
                relativePath: 'NPC/Roles/Mosshorn.json',
                archiveRelativePath: 'Server/NPC/Roles/Mosshorn.json'
            },
            'Mosshorn.json',
            'NPC Roles',
            'Server/NPC/Roles/Mosshorn.json'
        );

        assert.strictEqual(matchesAllSearchTerms(searchableText, tokenizeSearchQuery('moss')), true);
    });

    test('requires all terms to be present', () => {
        const searchableText = buildAssetFileSearchText(
            {
                relativePath: 'NPC/Roles/Mosshorn.json',
                archiveRelativePath: 'Server/NPC/Roles/Mosshorn.json'
            },
            'Mosshorn.json',
            'NPC Roles',
            'Server/NPC/Roles/Mosshorn.json'
        );

        assert.strictEqual(matchesAllSearchTerms(searchableText, tokenizeSearchQuery('mosshorn missing')), false);
    });

    test('matches case-insensitively', () => {
        const searchableText = buildAssetFileSearchText(
            {
                relativePath: 'NPC/Roles/Mosshorn.json',
                archiveRelativePath: 'Server/NPC/Roles/Mosshorn.json'
            },
            'Mosshorn.json',
            'NPC Roles',
            'Server/NPC/Roles/Mosshorn.json'
        );

        assert.strictEqual(matchesAllSearchTerms(searchableText, tokenizeSearchQuery('MoSsHoRn ROLE')), true);
    });

    test('normalizes windows path separators', () => {
        const searchableText = buildAssetFileSearchText(
            {
                relativePath: 'NPC\\Roles\\Mosshorn.json',
                archiveRelativePath: 'Server\\NPC\\Roles\\Mosshorn.json'
            },
            'Mosshorn.json',
            'NPC Roles',
            'Server\\NPC\\Roles\\Mosshorn.json'
        );

        assert.strictEqual(matchesAllSearchTerms(searchableText, tokenizeSearchQuery('mosshorn role')), true);
    });

    test('empty query results in no filtering', () => {
        const searchableText = buildAssetFileSearchText(
            {
                relativePath: 'NPC/Roles/Mosshorn.json',
                archiveRelativePath: 'Server/NPC/Roles/Mosshorn.json'
            },
            'Mosshorn.json',
            'NPC Roles',
            'Server/NPC/Roles/Mosshorn.json'
        );

        assert.strictEqual(matchesAllSearchTerms(searchableText, tokenizeSearchQuery('   ')), true);
    });

    test('store search text includes extension and path metadata', () => {
        const searchableText = buildStoreSearchText(
            {
                assetSimpleName: 'NpcRole',
                path: 'Server/NPC/Roles',
                extension: '.json'
            },
            'NpcRole',
            '/Server/NPC/Roles',
            'Server/NPC/Roles | extension: .json | assets: 12'
        );

        assert.strictEqual(matchesAllSearchTerms(searchableText, tokenizeSearchQuery('roles json')), true);
    });
});
