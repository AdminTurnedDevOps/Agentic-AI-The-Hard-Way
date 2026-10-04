import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

export const collections = {
  pages: defineCollection({
    loader: glob({
      // The repo root is one level up. Dot-directories (.git, .github, .superpowers) are skipped by default.
      pattern: ['**/*.md', '!README.md', '!site/**', '!docs/**', '!**/node_modules/**'],
      base: '..',
      generateId: ({ entry }) => entry.replace(/\.md$/, ''),
    }),
  }),
};
