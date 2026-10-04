import fs from 'node:fs';
import path from 'node:path';
import { navRepoPaths, parseReadmeNav, type RepoFs, type SiteNav } from './readme-nav';
import { findImageRefs, findOrphanPages, findUnreferencedImages } from './content-report';
import { collectTreeLinks } from './routes';

/** Commands run from site/, so the repo is one level up. */
export const REPO_ROOT = path.resolve(process.cwd(), '..');

const SKIP_DIRS = new Set(['site', 'docs', 'node_modules']);
export const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
export const CODE_EXTS: Record<string, string> = {
  '.yaml': 'yaml', '.yml': 'yaml', '.py': 'python', '.json': 'json', '.sh': 'bash',
  '.tf': 'hcl', '.ts': 'typescript', '.go': 'go', '.toml': 'toml', '.txt': 'text',
};

/** Repo-relative POSIX paths of files with the given extensions, skipping site/, docs/ and dot-dirs. */
export function walkRepo(root: string, exts: string[]): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(abs);
      } else if (exts.includes(path.extname(entry.name).toLowerCase())) {
        found.push(path.relative(root, abs).split(path.sep).join('/'));
      }
    }
  };
  walk(root);
  return found.sort();
}

export function repoFs(root: string): RepoFs {
  return {
    exists(repoPath, kind) {
      const abs = path.join(root, repoPath);
      if (!fs.existsSync(abs)) return false;
      return kind === 'dir' ? fs.statSync(abs).isDirectory() : fs.statSync(abs).isFile();
    },
    isEmpty(repoPath) {
      return fs.readFileSync(path.join(root, repoPath), 'utf8').trim() === '';
    },
  };
}

const navCache = new Map<string, SiteNav>();
export function loadSiteNav(root: string = REPO_ROOT): SiteNav {
  let nav = navCache.get(root);
  if (!nav) {
    nav = parseReadmeNav(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), repoFs(root));
    navCache.set(root, nav);
  }
  return nav;
}

const readText = (root: string, repoPath: string) => fs.readFileSync(path.join(root, repoPath), 'utf8');

/** Every folder linked with a tree/main URL from the README or any page; each gets a folder page. */
export function folderDirs(root: string = REPO_ROOT): string[] {
  return collectTreeLinks(walkRepo(root, ['.md']).map((p) => readText(root, p)));
}

export interface FolderCodeFile { name: string; lang: string; text: string }

export function folderFiles(root: string, dir: string): { md: string[]; code: FolderCodeFile[] } {
  const names = fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
  return {
    md: names.filter((n) => n.endsWith('.md')).map((n) => `${dir}/${n}`),
    code: names
      .filter((n) => CODE_EXTS[path.extname(n).toLowerCase()])
      .map((n) => ({ name: n, lang: CODE_EXTS[path.extname(n).toLowerCase()], text: readText(root, `${dir}/${n}`) })),
  };
}

export function buildContentReport(root: string = REPO_ROOT): { orphans: string[]; unreferencedImages: string[] } {
  const mdPaths = walkRepo(root, ['.md']);
  const referenced = new Set(mdPaths.flatMap((p) => findImageRefs(readText(root, p), p)));
  return {
    orphans: findOrphanPages(mdPaths.filter((p) => p !== 'README.md'), navRepoPaths(loadSiteNav(root)), folderDirs(root)),
    unreferencedImages: findUnreferencedImages(walkRepo(root, IMAGE_EXTS), referenced),
  };
}
