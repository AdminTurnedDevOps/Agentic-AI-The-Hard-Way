import path from 'node:path';

const IMAGE_RE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

/** Repo paths of the relative images a markdown file references. */
export function findImageRefs(markdown: string, fromRepoPath: string): string[] {
  const refs: string[] = [];
  for (const match of markdown.matchAll(IMAGE_RE)) {
    const url = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/')) continue;
    refs.push(path.posix.normalize(path.posix.join(path.posix.dirname(fromRepoPath), decodeURI(url.split('#')[0]))));
  }
  return refs;
}

export function findOrphanPages(mdRepoPaths: string[], navPaths: ReadonlySet<string>, folderDirs: string[]): string[] {
  return mdRepoPaths.filter((p) => !navPaths.has(p) && !folderDirs.includes(path.posix.dirname(p))).sort();
}

export function findUnreferencedImages(imageRepoPaths: string[], referenced: ReadonlySet<string>): string[] {
  return imageRepoPaths.filter((p) => !referenced.has(p)).sort();
}
