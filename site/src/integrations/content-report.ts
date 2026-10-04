import type { AstroIntegration } from 'astro';
import { buildContentReport } from '../lib/repo';

/** Warn about pages missing from the README and images nothing uses. */
export function contentReport(options: { repoRoot: string }): AstroIntegration {
  return {
    name: 'afg-content-report',
    hooks: {
      'astro:build:done': ({ logger }) => {
        const report = buildContentReport(options.repoRoot);
        for (const page of report.orphans) logger.warn(`not linked from README.md (built, not in navigation): ${page}`);
        for (const image of report.unreferencedImages) logger.warn(`image not referenced by any markdown: ${image}`);
      },
    },
  };
}
