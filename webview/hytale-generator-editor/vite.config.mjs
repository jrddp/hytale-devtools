import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: currentDir,
	base: './',
	plugins: [
		svelte(),
		tailwindcss()
	],
	build: {
		outDir: path.resolve(currentDir, '../../media/hytaleGeneratorEditor'),
		emptyOutDir: true,
		manifest: true,
		sourcemap: true,
		rollupOptions: {
			output: {
				entryFileNames: 'main.js',
				chunkFileNames: 'chunks/[name].js',
				assetFileNames: 'assets/[name][extname]'
			}
		}
	}
});
