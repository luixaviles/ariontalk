// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { resolve } from 'path';

export default defineConfig({
	vite: {
		resolve: {
			alias: {
				// Docs MDX files live outside this directory (at repo root docs/).
				// Vite resolves imports relative to the file's real path, so
				// @astrojs/starlight is not found from docs/. This alias fixes that.
				'@astrojs/starlight': resolve(
					import.meta.dirname,
					'node_modules/@astrojs/starlight'
				),
			},
		},
	},
	integrations: [
		starlight({
			title: 'ArionTalk',
			sidebar: [
				{
					label: 'Start Here',
					items: [
						{ label: 'Overview', slug: 'docs' },
						{ label: 'Getting Started', slug: 'docs/getting-started' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Installation', slug: 'docs/guides/installation' },
						{ label: 'Interactive Highlights', slug: 'docs/guides/interactive-highlights' },
						{ label: 'Configuration', slug: 'docs/guides/configuration' },
						{ label: 'Theming', slug: 'docs/guides/theming' },
						{ label: 'Events', slug: 'docs/guides/events' },
					],
				},
				{
					label: 'Engines',
					items: [
						{ label: 'Local (On-Device)', slug: 'docs/engines/local' },
						{ label: 'Gemini Live', slug: 'docs/engines/gemini' },
					],
				},
				{
					label: 'Plugins',
					items: [
						{ label: 'Overview', slug: 'docs/plugins/overview' },
						{ label: 'Silero VAD', slug: 'docs/plugins/silero-vad' },
					],
				},
				{
					label: 'API Reference',
					items: [
						{ label: '@ariontalk/core', slug: 'docs/api/core' },
						{ label: '@ariontalk/widget', slug: 'docs/api/widget' },
						{ label: '@ariontalk/engine-gemini', slug: 'docs/api/engine-gemini' },
						{ label: '@ariontalk/token-server', slug: 'docs/api/token-server' },
					],
				},
			],
		}),
	],
});
