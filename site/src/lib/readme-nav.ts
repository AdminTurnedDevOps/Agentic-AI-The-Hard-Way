import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { toString } from 'mdast-util-to-string';
import type { Heading, Link, List, ListItem, Node, Paragraph, Root, RootContent } from 'mdast';
import { parseRepoUrl, repoPathToRoute, type TargetKind } from './routes';

export interface LabItem { type: 'lab'; title: string; repoPath: string; kind: TargetKind; route: string; comingSoon: boolean; notes: string[]; children: NavItem[] }
export interface SoonItem { type: 'soon'; title: string; notes: string[]; children: NavItem[] }
export interface ExternalItem { type: 'external'; title: string; url: string; notes: string[]; children: NavItem[] }
export interface GroupItem { type: 'group'; title: string; children: NavItem[] }
export type NavItem = LabItem | SoonItem | ExternalItem | GroupItem;

export type TrackColor = 'blue' | 'violet' | 'green' | 'peach' | 'yellow';
export const TRACK_COLORS: readonly TrackColor[] = ['blue', 'violet', 'green', 'peach', 'yellow'];

export interface NavGroup {
  kind: 'track' | 'section';
  title: string;
  slug: string;
  blurb: string | null;
  color: TrackColor | null;
  beforeYouStart: NavItem[];
  items: NavItem[];
}

export interface SiteNav { intro: string; startHere: NavGroup; sections: NavGroup[]; tracks: NavGroup[] }

export interface RepoFs {
  exists(repoPath: string, kind: TargetKind): boolean;
  isEmpty(repoPath: string): boolean;
}

export class ReadmeNavError extends Error {}

const isHeading = (node: Node, depth: number): node is Heading => node.type === 'heading' && (node as Heading).depth === depth;
const line = (node: Node): number => node.position?.start.line ?? 0;

function linksIn(node: Node): Link[] {
  const found: Link[] = [];
  const walk = (n: Node) => {
    if (n.type === 'link') found.push(n as Link);
    const children = (n as { children?: Node[] }).children;
    if (children) children.forEach(walk);
  };
  walk(node);
  return found;
}

/** A paragraph made only of links, optionally labelled "prereq" (`**prereq**: [x](…)`), not prose with an inline link. */
function isLinkParagraph(node: Paragraph, links: Link[]): boolean {
  let rest = toString(node);
  for (const link of links) rest = rest.replace(toString(link), '');
  return rest.replace(/prereq/gi, '').replace(/[\s*:,.\-–—]/g, '') === '';
}

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function newGroup(kind: NavGroup['kind'], title: string): NavGroup {
  return { kind, title, slug: slugify(title), blurb: null, color: null, beforeYouStart: [], items: [] };
}

function linkToItem(link: Link, notes: string[], children: NavItem[], fs: RepoFs): NavItem {
  const title = toString(link).trim();
  const url = link.url.trim();
  if (url === '') return { type: 'soon', title, notes, children };
  const target = parseRepoUrl(url);
  if (!target) return { type: 'external', title, url, notes, children };
  if (!fs.exists(target.repoPath, target.kind)) {
    throw new ReadmeNavError(`README.md:${line(link)}: "${title}" links to ${target.repoPath}, which does not exist`);
  }
  const comingSoon = target.kind === 'file' && fs.isEmpty(target.repoPath);
  return { type: 'lab', title, repoPath: target.repoPath, kind: target.kind, route: repoPathToRoute(target.repoPath, target.kind), comingSoon, notes, children };
}

function parseListItem(item: ListItem, fs: RepoFs): NavItem {
  const paragraph = item.children.find((c): c is Paragraph => c.type === 'paragraph');
  const nested = item.children.filter((c): c is List => c.type === 'list').flatMap((l) => l.children);
  const notes = nested.filter((c) => linksIn(c).length === 0).map((c) => toString(c).trim()).filter(Boolean);
  const children = nested.filter((c) => linksIn(c).length > 0).map((c) => parseListItem(c, fs));
  const link = paragraph ? linksIn(paragraph)[0] : undefined;
  if (link) return linkToItem(link, notes, children, fs);
  const title = paragraph ? toString(paragraph).trim().replace(/:$/, '') : '';
  if (children.length === 0) {
    throw new ReadmeNavError(`README.md:${line(item)}: list item "${title}" has no link and no linked sub-items`);
  }
  return { type: 'group', title, children };
}

function scenarioBlurbs(nodes: RootContent[]): Array<{ title: string; text: string }> {
  const start = nodes.findIndex((n) => isHeading(n, 2) && toString(n).trim() === 'The Scenarios');
  if (start === -1) return [];
  const blurbs: Array<{ title: string; text: string }> = [];
  let current: { title: string; text: string } | null = null;
  for (const node of nodes.slice(start + 1)) {
    if (isHeading(node, 2)) break;
    if (isHeading(node, 3)) {
      current = { title: toString(node).trim(), text: '' };
      blurbs.push(current);
    } else if (current && !current.text && node.type === 'paragraph') {
      current.text = toString(node).trim();
    }
  }
  return blurbs;
}

export function parseReadmeNav(markdown: string, fs: RepoFs): SiteNav {
  const tree = unified().use(remarkParse).parse(markdown) as Root;
  const nodes = tree.children;

  const h1 = nodes.findIndex((n) => isHeading(n, 1));
  const introNode = nodes.slice(h1 + 1).find((n) => n.type === 'paragraph' && linksIn(n).length === 0);
  const intro = introNode ? toString(introNode).trim() : '';

  const blurbs = scenarioBlurbs(nodes);
  const labsAt = nodes.findIndex((n) => isHeading(n, 2) && toString(n).trim() === 'Labs');
  if (labsAt === -1) throw new ReadmeNavError('README.md: no "## Labs" heading found');

  const startHere = newGroup('section', 'Start here');
  const sections: NavGroup[] = [];
  const tracks: NavGroup[] = [];
  const fallbackBlurb = new Map<NavGroup, string>();
  let current = startHere;

  for (const node of nodes.slice(labsAt + 1)) {
    if (isHeading(node, 2)) {
      current = newGroup('section', toString(node).trim());
      sections.push(current);
    } else if (isHeading(node, 3)) {
      const title = toString(node).trim();
      current = newGroup('track', title);
      const match = blurbs.find((b) => title.toLowerCase().startsWith(b.title.toLowerCase()));
      current.blurb = match?.text ?? null;
      tracks.push(current);
    } else if (node.type === 'paragraph') {
      const links = linksIn(node);
      if (links.length === 0 || !isLinkParagraph(node, links)) {
        if (current.kind === 'track' && !fallbackBlurb.has(current)) fallbackBlurb.set(current, toString(node).trim());
        continue;
      }
      for (const link of links) {
        const item = linkToItem(link, [], [], fs);
        (current.kind === 'track' ? current.beforeYouStart : current.items).push(item);
      }
    } else if (node.type === 'list') {
      if (current === startHere) {
        throw new ReadmeNavError(`README.md:${line(node)}: list under "## Labs" before any "###" track`);
      }
      current.items.push(...node.children.map((item) => parseListItem(item, fs)));
    }
  }

  for (const track of tracks) if (!track.blurb) track.blurb = fallbackBlurb.get(track) ?? null;
  let colorIndex = 0;
  for (const track of tracks) {
    if (flattenLabs(track).length > 0) track.color = TRACK_COLORS[colorIndex++ % TRACK_COLORS.length];
  }
  return { intro, startHere, sections, tracks };
}

function walkLabs(items: NavItem[], visit: (lab: LabItem) => void): void {
  for (const item of items) {
    if (item.type === 'lab') visit(item);
    walkLabs(item.children, visit);
  }
}

export function allLabs(group: NavGroup): LabItem[] {
  const labs: LabItem[] = [];
  walkLabs(group.beforeYouStart, (l) => labs.push(l));
  walkLabs(group.items, (l) => labs.push(l));
  return labs;
}

export function flattenLabs(group: NavGroup): LabItem[] {
  return allLabs(group).filter((l) => !l.comingSoon);
}

export function firstLabRoute(group: NavGroup): string | null {
  return flattenLabs(group)[0]?.route ?? null;
}

export function countItems(group: NavGroup): { labs: number; soon: number } {
  let labs = 0;
  let soon = 0;
  const walk = (items: NavItem[]) => {
    for (const item of items) {
      if (item.type === 'lab') (item.comingSoon ? soon++ : labs++);
      if (item.type === 'soon') soon++;
      walk(item.children);
    }
  };
  walk(group.beforeYouStart);
  walk(group.items);
  return { labs, soon };
}

export function findGroupForRoute(nav: SiteNav, route: string): { group: NavGroup; item: LabItem } | null {
  for (const group of [nav.startHere, ...nav.sections, ...nav.tracks]) {
    const item = allLabs(group).find((l) => l.route === route);
    if (item) return { group, item };
  }
  return null;
}

export function navRepoPaths(nav: SiteNav): Set<string> {
  const paths = new Set<string>();
  for (const group of [nav.startHere, ...nav.sections, ...nav.tracks]) {
    for (const lab of allLabs(group)) if (lab.kind === 'file') paths.add(lab.repoPath);
  }
  return paths;
}
