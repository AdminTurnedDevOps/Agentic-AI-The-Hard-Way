import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://agenticfieldguide.ai',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'never' },
  markdown: { syntaxHighlight: false },
  vite: {
    // Keep every processed <script> as an external file so the CSP needs no 'unsafe-inline'.
    build: { assetsInlineLimit: 0 },
    // Markdown and images live in the repo root, one level above this project.
    server: { fs: { allow: ['..'] } },
  },
});
