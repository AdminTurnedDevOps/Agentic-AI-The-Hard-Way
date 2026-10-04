import fs from 'node:fs';
import path from 'node:path';
import { visit } from 'unist-util-visit';
import type { Definition, Link, Root } from 'mdast';
import { parseRepoUrl, repoPathToRoute, resolveRelativeMd, type TargetKind } from '../lib/routes';

export interface RepoLinksOptions {
  repoRoot: string;
  exists?: (repoPath: string, kind: TargetKind) => boolean;
}

function existsOnDisk(repoRoot: string) {
  return (repoPath: string, kind: TargetKind): boolean => {
    const abs = path.join(repoRoot, repoPath);
    if (!fs.existsSync(abs)) return false;
    return kind === 'dir' ? fs.statSync(abs).isDirectory() : fs.statSync(abs).isFile();
  };
}

/** Rewrite links into this repo (GitHub URLs and relative .md links) to site routes. */
export function remarkRepoLinks(options: RepoLinksOptions) {
  const exists = options.exists ?? existsOnDisk(options.repoRoot);
  return (tree: Root, file: { path?: string }) => {
    const fromRepoPath = file.path ? path.relative(options.repoRoot, file.path).split(path.sep).join('/') : '';
    visit(tree, (node) => {
      if (node.type !== 'link' && node.type !== 'definition') return;
      const link = node as Link | Definition;
      const target = parseRepoUrl(link.url) ?? (fromRepoPath ? resolveRelativeMd(link.url, fromRepoPath) : null);
      if (!target) return;
      if (!exists(target.repoPath, target.kind)) {
        throw new Error(`${fromRepoPath || 'markdown'}:${link.position?.start.line ?? 0}: link to ${target.repoPath}, which does not exist`);
      }
      link.url = repoPathToRoute(target.repoPath, target.kind) + target.hash;
    });
  };
}
