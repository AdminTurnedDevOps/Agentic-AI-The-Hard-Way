import path from 'node:path';

export const REPO_URL = 'https://github.com/AdminTurnedDevOps/Agentic-AI-The-Hard-Way';

export type TargetKind = 'file' | 'dir';

export interface RepoTarget {
  kind: TargetKind;
  repoPath: string;
  hash: string;
}

const REPO_LINK_RE =
  /^https:\/\/github\.com\/AdminTurnedDevOps\/Agentic-AI-The-Hard-Way\/(blob|tree)\/main\/([^#?]+?)\/?(#[^?]*)?$/;
const TREE_LINK_GLOBAL_RE =
  /https:\/\/github\.com\/AdminTurnedDevOps\/Agentic-AI-The-Hard-Way\/tree\/main\/[^\s)#?"'<>]+/g;

/** Parse a link into this repo. Non-markdown blobs stay on GitHub, so they return null. */
export function parseRepoUrl(url: string): RepoTarget | null {
  const match = REPO_LINK_RE.exec(url.trim());
  if (!match) return null;
  const [, mode, repoPath, hash = ''] = match;
  if (mode === 'tree') return { kind: 'dir', repoPath, hash };
  if (!repoPath.endsWith('.md')) return null;
  return { kind: 'file', repoPath, hash };
}

export function repoPathToRoute(repoPath: string, kind: TargetKind): string {
  if (kind === 'file' && repoPath === 'README.md') return '/';
  const clean = kind === 'file' ? repoPath.replace(/\.md$/, '') : repoPath.replace(/\/+$/, '');
  return `/${clean}/`;
}

export function githubUrl(repoPath: string, kind: TargetKind): string {
  return `${REPO_URL}/${kind === 'file' ? 'blob' : 'tree'}/main/${repoPath}`;
}

/** Resolve a relative `.md` link written in the file at `fromRepoPath`. */
export function resolveRelativeMd(url: string, fromRepoPath: string): RepoTarget | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/') || url.startsWith('#')) return null;
  const [filePart, hashPart] = url.split('#');
  if (!filePart.endsWith('.md')) return null;
  const repoPath = path.posix.normalize(path.posix.join(path.posix.dirname(fromRepoPath), filePart));
  if (repoPath.startsWith('..')) return null;
  return { kind: 'file', repoPath, hash: hashPart ? `#${hashPart}` : '' };
}

/** Every folder this repo links to with a `tree/main/...` URL, across the given texts. */
export function collectTreeLinks(texts: string[]): string[] {
  const dirs = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(TREE_LINK_GLOBAL_RE)) {
      const target = parseRepoUrl(match[0]);
      if (target?.kind === 'dir') dirs.add(target.repoPath);
    }
  }
  return [...dirs].sort();
}
