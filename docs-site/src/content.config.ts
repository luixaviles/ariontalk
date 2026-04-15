import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({
		loader: glob({
			base: '../docs',
			pattern: '**/[^_]*.{md,mdx}',
			generateId: ({ entry }) => {
				const id = entry.replace(/\.[^.]+$/, '');
				const prefixed = `docs/${id}`;
				return prefixed.replace(/\/index$/, '');
			},
		}),
		schema: docsSchema(),
	}),
};
