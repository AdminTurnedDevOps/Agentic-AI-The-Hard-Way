import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildContentReport, folderDirs, folderFiles, loadSiteNav, walkRepo } from '../../src/lib/repo';

const R = 'https://github.com/AdminTurnedDevOps/Agentic-AI-The-Hard-Way';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'afg-repo-'));
const write = (p: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
  fs.writeFileSync(path.join(root, p), text);
};
write('README.md', `# T\n\nIntro text.\n\n## Labs\n\n### Track\n\n1. [One](${R}/blob/main/t/one.md)\n2. [App](${R}/tree/main/apps/app)\n`);
write('t/one.md', `# One\n\n![shot](../images/used.png)\n\nSee [aks](${R}/tree/main/infra/aks).\n`);
write('t/orphan.md', 'not linked');
write('apps/app/setup.md', 'setup');
write('apps/app/deploy.yaml', 'kind: Deployment\n');
write('apps/app/.hidden', 'x');
write('infra/aks/main.tf', 'terraform {}\n');
write('images/used.png', 'png');
write('images/unused.png', 'png');
write('site/ignored.md', 'x');
write('docs/ignored.md', 'x');
write('.superpowers/ignored.md', 'x');
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('walkRepo', () => {
  it('skips site/, docs/ and dot-directories', () => {
    expect(walkRepo(root, ['.md'])).toEqual(['README.md', 'apps/app/setup.md', 't/one.md', 't/orphan.md']);
  });
});

describe('loadSiteNav / folderDirs / folderFiles', () => {
  it('loads the nav from a repo root', () => {
    expect(loadSiteNav(root).tracks[0].items.map((i) => i.type === 'lab' && i.route)).toEqual(['/t/one/', '/apps/app/']);
  });
  it('collects folder links from README and pages', () => {
    expect(folderDirs(root)).toEqual(['apps/app', 'infra/aks']);
  });
  it("lists a folder's markdown and code files, sorted, skipping dotfiles", () => {
    expect(folderFiles(root, 'apps/app')).toEqual({
      md: ['apps/app/setup.md'],
      code: [{ name: 'deploy.yaml', lang: 'yaml', text: 'kind: Deployment\n' }],
    });
  });
});

describe('buildContentReport', () => {
  it('reports orphan pages and unreferenced images', () => {
    expect(buildContentReport(root)).toEqual({ orphans: ['t/orphan.md'], unreferencedImages: ['images/unused.png'] });
  });
});
