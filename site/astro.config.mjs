import path from 'node:path';
import { defineConfig } from 'astro/config';
import { remarkRepoLinks } from './src/plugins/remark-repo-links.ts';
import { remarkCodeVars } from './src/plugins/remark-code-vars.ts';
import { remarkDemoteH1 } from './src/plugins/remark-demote-h1.ts';

const REPO_ROOT = path.resolve(process.cwd(), '..');

export default defineConfig({
  site: 'https://agenticfieldguide.ai',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'never' },
  markdown: {
    syntaxHighlight: false,
    remarkPlugins: [[remarkRepoLinks, { repoRoot: REPO_ROOT }], remarkCodeVars, remarkDemoteH1],
  },
  vite: {
    // Keep every processed <script> as an external file so the CSP needs no 'unsafe-inline'.
    build: { assetsInlineLimit: 0 },
    // Markdown and images live in the repo root, one level above this project.
    server: { fs: { allow: ['..'] } },
  },
});
