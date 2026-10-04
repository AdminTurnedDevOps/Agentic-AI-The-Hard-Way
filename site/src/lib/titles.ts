import path from 'node:path';

/** README link text, else the page's first H1 (outside code fences), else the file name. */
export function pageTitle(navTitle: string | null, body: string, repoPath: string): string {
  if (navTitle) return navTitle;
  const withoutFences = body.replace(/```[\s\S]*?```/g, '');
  const h1 = /^#\s+(.+?)\s*#*\s*$/m.exec(withoutFences);
  if (h1) return h1[1];
  const base = path.posix.basename(repoPath).replace(/\.md$/, '').replace(/[-_]+/g, ' ');
  return base.charAt(0).toUpperCase() + base.slice(1);
}
