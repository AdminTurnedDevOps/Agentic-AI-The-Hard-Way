import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Heading, Html, Root } from 'mdast';
import { remarkRepoLinks } from '../../src/plugins/remark-repo-links';
import { remarkCodeVars } from '../../src/plugins/remark-code-vars';
import { remarkDemoteH1 } from '../../src/plugins/remark-demote-h1';

const R = 'https://github.com/AdminTurnedDevOps/Agentic-AI-The-Hard-Way';
const run = (md: string, plugin: (tree: Root, file: { path?: string }) => void, filePath = '/repo/a/page.md') => {
  const tree = unified().use(remarkParse).parse(md) as Root;
  plugin(tree, { path: filePath });
  return tree;
};
const links = (tree: Root): string[] => {
  const out: string[] = [];
  const walk = (n: { type: string; url?: string; children?: unknown[] }) => {
    if (n.type === 'link' || n.type === 'definition') out.push(n.url as string);
    (n.children as typeof n[] | undefined)?.forEach(walk);
  };
  walk(tree as never);
  return out;
};

describe('remarkRepoLinks', () => {
  const exists = (p: string) => ['a/other.md', 'b/c.md', 'k8s-terraform/aks'].includes(p);
  const plugin = remarkRepoLinks({ repoRoot: '/repo', exists });
  it('rewrites repo links, relative links and reference definitions', () => {
    const md = `[x](${R}/blob/main/b/c.md#top) [y](other.md) [z](${R}/tree/main/k8s-terraform/aks) [r][ref]\n\n[ref]: ${R}/blob/main/b/c.md\n`;
    expect(links(run(md, plugin))).toEqual(['/b/c/#top', '/a/other/', '/k8s-terraform/aks/', '/b/c/']);
  });
  it('leaves external and other-repo links untouched', () => {
    const md = '[k](https://kagent.dev/docs) [d](https://github.com/AdminTurnedDevOps/agentic-demo-repo/tree/main/x) [p](notes.txt)';
    expect(links(run(md, plugin))).toEqual(['https://kagent.dev/docs', 'https://github.com/AdminTurnedDevOps/agentic-demo-repo/tree/main/x', 'notes.txt']);
  });
  it('fails with file and line when the target does not exist', () => {
    expect(() => run(`text\n\n[gone](${R}/blob/main/gone.md)`, plugin)).toThrow('a/page.md:3: link to gone.md, which does not exist');
  });
});

describe('remarkCodeVars', () => {
  it('replaces code nodes with HTML that marks variables', () => {
    const tree = run('```bash\necho $FOO\n```', remarkCodeVars());
    const html = tree.children[0] as Html;
    expect(html.type).toBe('html');
    expect(html.value).toBe('<figure class="code" data-lang="bash"><pre><code>echo <span class="var" data-var="FOO" data-raw="$FOO">$FOO</span></code></pre></figure>');
  });
  it('handles fences without a language', () => {
    const html = run('```\nx\n```', remarkCodeVars()).children[0] as Html;
    expect(html.value).toBe('<figure class="code"><pre><code>x</code></pre></figure>');
  });
});

describe('remarkDemoteH1', () => {
  it('turns H1 into H2 and leaves other headings', () => {
    const tree = run('# One\n\n## Two', remarkDemoteH1());
    expect((tree.children as Heading[]).map((h) => h.depth)).toEqual([2, 2]);
  });
});
