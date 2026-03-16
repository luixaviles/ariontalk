// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');

export default defineConfig({
	site: 'https://ariontalk.com',
	vite: {
		resolve: {
			alias: {
				'@ariontalk/core': resolve(root, 'packages/core/src/index.ts'),
				'@ariontalk/widget': resolve(root, 'packages/widget/src/index.ts'),
				'@ariontalk/engine-gemini': resolve(root, 'packages/engine-gemini/src/index.ts'),
			},
		},
	},
	integrations: [
		starlight({
			title: 'ArionTalk',
			logo: {
				src: './src/assets/logo-accent.svg',
				replacesTitle: false,
			},
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/luixaviles/ariontalk',
				},
			],
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
			components: {
				Head: './src/components/overrides/Head.astro',
			},
			customCss: ['./src/styles/custom.css'],
		}),
	],
});
