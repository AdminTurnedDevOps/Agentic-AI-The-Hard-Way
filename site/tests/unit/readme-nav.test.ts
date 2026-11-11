import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  allLabs, allScenarios, countItems, findGroupForRoute, firstLabRoute, flattenLabs, navRepoPaths, parseReadmeNav, ReadmeNavError, slugify,
  trackTotals, type RepoFs,
} from '../../src/lib/readme-nav';

const R = 'https://github.com/AdminTurnedDevOps/Agentic-AI-The-Hard-Way';
const stubFs = (files: Record<string, string>, dirs: string[] = []): RepoFs => ({
  exists: (p, kind) => (kind === 'dir' ? dirs.includes(p) : p in files),
  isEmpty: (p) => !(files[p] ?? '').trim(),
});

const FIXTURE = `# Title

Prefer reading in a browser? Visit [site](https://agenticfieldguide.ai).

Intro paragraph with no links.

## The Scenarios

1. Alpha Track

### Alpha Track

Alpha scenario blurb.

### Isolated Agents

Isolated blurb.

## Labs

Before going into the labs, a few prereqs.

[Prerequisites](${R}/blob/main/prerequisites.md)

## AI Workstation Setup

1. [Laptop](${R}/blob/main/workstation-setup/laptop.md)
   - [Key Implementations](${R}/blob/main/workstation-setup/keys.md)

## Running Things

Running track blurb.

A second paragraph that is not the blurb.

### Alpha Track

These labs use Llama.

**prereq**: [Hardware decisions]()

1. [Deploy the broken app](${R}/tree/main/the-broken-apps/app).
    - The app is intentionally broken.
2. [vLLM](${R}/blob/main/alpha/vllm.md)
3. Gateway setup:
    - [Deploy gateway](${R}/blob/main/alpha/deploy-gw.md)
    - [Prompt guards]()
4. [Metrics]()
    - [Agent Identity]()
5. [Docs](https://kagent.dev/docs)

### Isolated Agents With kagent + Substrate

[prereq - learn Substrate](${R}/blob/main/iso/learn.md)
1. [Install](${R}/blob/main/iso/install.md)

## Sandboxes & Infrastructure

### Isolated Environments

WIP

### Beta Track

1. [Beta one](${R}/blob/main/beta/one.md)
`;

const FILES = {
  'prerequisites.md': '# p',
  'workstation-setup/laptop.md': 'x',
  'workstation-setup/keys.md': 'x',
  'alpha/vllm.md': '',
  'alpha/deploy-gw.md': 'x',
  'iso/learn.md': 'x',
  'iso/install.md': 'x',
  'beta/one.md': 'x',
};
const nav = () => parseReadmeNav(FIXTURE, stubFs(FILES, ['the-broken-apps/app']));
const scenarios = () => allScenarios(nav());

describe('parseReadmeNav: structure', () => {
  it('takes the intro from the first link-free paragraph after the title', () => {
    expect(nav().intro).toBe('Intro paragraph with no links.');
  });
  it('keeps a ## with its own list as a section and turns a ## with ### scenarios into a track', () => {
    const n = nav();
    expect(n.startHere.items.map((i) => i.type === 'lab' && i.route)).toEqual(['/prerequisites/']);
    expect(n.sections.map((s) => s.title)).toEqual(['AI Workstation Setup']);
    expect(n.tracks.map((t) => t.title)).toEqual(['Running Things', 'Sandboxes & Infrastructure']);
  });
  it('puts each ### scenario in the track above it, in README order', () => {
    expect(nav().tracks.map((t) => t.scenarios.map((s) => s.title))).toEqual([
      ['Alpha Track', 'Isolated Agents With kagent + Substrate'],
      ['Isolated Environments', 'Beta Track'],
    ]);
    expect(scenarios().every((s) => s.kind === 'scenario')).toBe(true);
  });
  it('gives each track a slug, a /tracks/ route and its first paragraph as the blurb', () => {
    const [running, sandboxes] = nav().tracks;
    expect(running).toMatchObject({ slug: 'running-things', route: '/tracks/running-things/', blurb: 'Running track blurb.' });
    expect(sandboxes).toMatchObject({ slug: 'sandboxes-infrastructure', route: '/tracks/sandboxes-infrastructure/', blurb: null });
  });
  it('treats prose with an inline link as text, not a before-you-start item', () => {
    const md = `# T\n\nIntro.\n\n## Labs\n\n## Track\n\n### A\n\nThese labs use any [supported provider](https://kagent.dev/x).\n\n1. [One](${R}/blob/main/a.md)\n`;
    const scenario = parseReadmeNav(md, stubFs({ 'a.md': 'x' })).tracks[0].scenarios[0];
    expect(scenario.beforeYouStart).toEqual([]);
    expect(scenario.blurb).toBe('These labs use any supported provider.');
  });
  it('nests sub-items under their parent', () => {
    const laptop = nav().sections[0].items[0];
    expect(laptop.type).toBe('lab');
    expect(laptop.children.map((c) => c.type === 'lab' && c.route)).toEqual(['/workstation-setup/keys/']);
  });
  it('turns prereq paragraph links into before-you-start items', () => {
    const [alpha, iso] = scenarios();
    expect(alpha.beforeYouStart).toEqual([{ type: 'soon', title: 'Hardware decisions', notes: [], children: [] }]);
    expect(iso.beforeYouStart.map((i) => i.type === 'lab' && i.route)).toEqual(['/iso/learn/']);
  });
  it('handles folder links, notes, empty files, groups, soon items and external links', () => {
    const items = scenarios()[0].items;
    expect(items[0]).toMatchObject({ type: 'lab', kind: 'dir', route: '/the-broken-apps/app/', notes: ['The app is intentionally broken.'] });
    expect(items[1]).toMatchObject({ type: 'lab', title: 'vLLM', comingSoon: true });
    expect(items[2]).toMatchObject({ type: 'group', title: 'Gateway setup' });
    expect(items[2].children.map((c) => c.type)).toEqual(['lab', 'soon']);
    expect(items[3]).toMatchObject({ type: 'soon', title: 'Metrics' });
    expect(items[3].children).toEqual([{ type: 'soon', title: 'Agent Identity', notes: [], children: [] }]);
    expect(items[4]).toMatchObject({ type: 'external', title: 'Docs', url: 'https://kagent.dev/docs' });
  });
});

describe('parseReadmeNav: blurbs, colors, slugs', () => {
  it('matches scenario blurbs by prefix and falls back to the first plain paragraph for scenarios with labs', () => {
    const [alpha, iso, envs, beta] = scenarios();
    expect(alpha.blurb).toBe('Alpha scenario blurb.');
    expect(iso.blurb).toBe('Isolated blurb.');
    expect(envs.blurb).toBeNull();
    expect(beta.blurb).toBeNull();
  });
  it('colors only scenarios with real labs, in README order across tracks', () => {
    expect(scenarios().map((s) => s.color)).toEqual(['blue', 'violet', null, 'green']);
  });
  it('slugifies titles', () => {
    expect(slugify('Isolated Agents With kagent + Agent substrate')).toBe('isolated-agents-with-kagent-agent-substrate');
  });
});

describe('parseReadmeNav: errors', () => {
  it('names the README line of a link to a missing file', () => {
    const md = `# T\n\nIntro.\n\n## Labs\n\n## Track\n\n### A\n\n1. [Gone](${R}/blob/main/gone.md)\n`;
    expect(() => parseReadmeNav(md, stubFs({}))).toThrow(/README\.md:11: "Gone" links to gone\.md, which does not exist/);
  });
  it('rejects a ### scenario that has no ## track heading above it', () => {
    const md = `# T\n\nIntro.\n\n## Labs\n\n### A\n\n1. [One](${R}/blob/main/a.md)\n`;
    expect(() => parseReadmeNav(md, stubFs({ 'a.md': 'x' }))).toThrow(/README\.md:7: "### A" needs a "##" track heading above it/);
  });
  it('rejects a ## that has both its own lab list and ### scenarios', () => {
    const md = `# T\n\nIntro.\n\n## Labs\n\n## Mixed\n\n1. [One](${R}/blob/main/a.md)\n\n### A\n\n1. [Two](${R}/blob/main/a.md)\n`;
    expect(() => parseReadmeNav(md, stubFs({ 'a.md': 'x' }))).toThrow(/README\.md:7: "## Mixed" has its own lab list and "###" scenarios/);
  });
  it('rejects a list under ## Labs before any section or track', () => {
    const md = `# T\n\nIntro.\n\n## Labs\n\n1. [A](${R}/blob/main/a.md)\n`;
    expect(() => parseReadmeNav(md, stubFs({ 'a.md': 'x' }))).toThrow(ReadmeNavError);
  });
  it('rejects a README without ## Labs', () => {
    expect(() => parseReadmeNav('# T\n\nIntro.\n', stubFs({}))).toThrow(/no "## Labs" heading/);
  });
});

describe('formatted link text and anchors', () => {
  it('uses plain link text as the title and keeps the route anchor-free', () => {
    const md = `# T\n\nIntro.\n\n## Labs\n\n## Track\n\n### A\n\n1. [**Deploy** \`kagent\`](${R}/blob/main/a.md#helm)\n`;
    const item = parseReadmeNav(md, stubFs({ 'a.md': 'x' })).tracks[0].scenarios[0].items[0];
    expect(item).toMatchObject({ type: 'lab', title: 'Deploy kagent', route: '/a/' });
  });
});

describe('helpers', () => {
  it('flattens labs in README order, skipping coming-soon', () => {
    expect(flattenLabs(scenarios()[0]).map((l) => l.route)).toEqual(['/the-broken-apps/app/', '/alpha/deploy-gw/']);
    expect(allLabs(scenarios()[0]).map((l) => l.route)).toContain('/alpha/vllm/');
  });
  it('finds first lab, counts, and the group and track for a route', () => {
    const n = nav();
    const all = allScenarios(n);
    expect(firstLabRoute(all[1])).toBe('/iso/learn/');
    expect(firstLabRoute(all[2])).toBeNull();
    expect(countItems(all[0])).toEqual({ labs: 2, soon: 5 });
    expect(findGroupForRoute(n, '/alpha/deploy-gw/')).toMatchObject({ group: { title: 'Alpha Track' }, track: { title: 'Running Things' } });
    expect(findGroupForRoute(n, '/beta/one/')?.track?.title).toBe('Sandboxes & Infrastructure');
    expect(findGroupForRoute(n, '/workstation-setup/keys/')).toMatchObject({ group: { title: 'AI Workstation Setup' }, track: null });
    expect(findGroupForRoute(n, '/nope/')).toBeNull();
    expect(navRepoPaths(n).has('iso/install.md')).toBe(true);
  });
  it('totals the scenarios and labs of a track', () => {
    const [running, sandboxes] = nav().tracks;
    expect(trackTotals(running)).toEqual({ scenarios: 2, labs: 4, soon: 5 });
    expect(trackTotals(sandboxes)).toEqual({ scenarios: 2, labs: 1, soon: 0 });
  });
});

describe('the real README', () => {
  it('parses without errors and yields tracks whose scenarios have labs', () => {
    const root = path.resolve(process.cwd(), '..');
    const real: RepoFs = {
      exists: (p, kind) => fs.existsSync(path.join(root, p)) && (kind === 'dir' ? fs.statSync(path.join(root, p)).isDirectory() : fs.statSync(path.join(root, p)).isFile()),
      isEmpty: (p) => fs.readFileSync(path.join(root, p), 'utf8').trim() === '',
    };
    const n = parseReadmeNav(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), real);
    expect(n.intro.length).toBeGreaterThan(40);
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const afterLabs = readme.slice(readme.search(/^## Labs\s*$/m));
    const scenarioHeadings = afterLabs.match(/^### .+$/gm) ?? [];
    const all = allScenarios(n);
    expect(all.map((s) => s.title)).toEqual(scenarioHeadings.map((h) => h.replace(/^###\s+/, '').trim()));
    expect(n.sections.some((s) => /workstation/i.test(s.title))).toBe(true);
    expect(n.tracks.length).toBeGreaterThan(1);
    expect(n.tracks.every((t) => t.scenarios.some((s) => flattenLabs(s).length > 0))).toBe(true);
    expect(n.tracks.every((t) => t.blurb)).toBe(true);
    expect(new Set(n.tracks.map((t) => t.slug)).size).toBe(n.tracks.length);
    expect(n.startHere.items.length).toBeGreaterThan(0);
    expect(all.flatMap((s) => s.beforeYouStart).some((i) => i.type === 'external')).toBe(false);
  });
});
