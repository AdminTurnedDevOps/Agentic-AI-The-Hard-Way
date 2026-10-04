import { describe, expect, it } from 'vitest';
import { collectTreeLinks, githubUrl, parseRepoUrl, repoPathToRoute, resolveRelativeMd } from '../../src/lib/routes';

const R = 'https://github.com/AdminTurnedDevOps/Agentic-AI-The-Hard-Way';

describe('parseRepoUrl', () => {
  it('parses blob links to markdown', () => {
    expect(parseRepoUrl(`${R}/blob/main/platform-engineering-assistant/deploy-kagent.md`)).toEqual({ kind: 'file', repoPath: 'platform-engineering-assistant/deploy-kagent.md', hash: '' });
  });
  it('keeps anchors', () => {
    expect(parseRepoUrl(`${R}/blob/main/a/b.md#helm`)).toEqual({ kind: 'file', repoPath: 'a/b.md', hash: '#helm' });
  });
  it('parses tree links with and without trailing slash', () => {
    expect(parseRepoUrl(`${R}/tree/main/the-broken-apps/pe-assistant-app`)).toEqual({ kind: 'dir', repoPath: 'the-broken-apps/pe-assistant-app', hash: '' });
    expect(parseRepoUrl(`${R}/tree/main/k8s-terraform/aks/`)).toEqual({ kind: 'dir', repoPath: 'k8s-terraform/aks', hash: '' });
  });
  it('leaves non-markdown blobs, other repos, other branches and other hosts alone', () => {
    expect(parseRepoUrl(`${R}/blob/main/the-observer/create-agent/agent.py`)).toBeNull();
    expect(parseRepoUrl('https://github.com/AdminTurnedDevOps/agentic-demo-repo/tree/main/claude-setup/skills')).toBeNull();
    expect(parseRepoUrl(`${R}/blob/dev/a.md`)).toBeNull();
    expect(parseRepoUrl('https://kagent.dev/docs/kagent')).toBeNull();
    expect(parseRepoUrl('')).toBeNull();
  });
});

describe('repoPathToRoute / githubUrl', () => {
  it('maps files and dirs to trailing-slash routes', () => {
    expect(repoPathToRoute('isolated-agent/installation.md', 'file')).toBe('/isolated-agent/installation/');
    expect(repoPathToRoute('k8s-terraform/aks', 'dir')).toBe('/k8s-terraform/aks/');
    expect(repoPathToRoute('README.md', 'file')).toBe('/');
  });
  it('builds GitHub URLs', () => {
    expect(githubUrl('a/b.md', 'file')).toBe(`${R}/blob/main/a/b.md`);
    expect(githubUrl('a/b', 'dir')).toBe(`${R}/tree/main/a/b`);
  });
});

describe('resolveRelativeMd', () => {
  it('resolves relative markdown links against the source file', () => {
    expect(resolveRelativeMd('../platform-engineering-assistant/deploy-kagent.md', 'autonomous-k8s-engineer/x.md')).toEqual({ kind: 'file', repoPath: 'platform-engineering-assistant/deploy-kagent.md', hash: '' });
    expect(resolveRelativeMd('setup.md#gke', 'k8s-terraform/other.md')).toEqual({ kind: 'file', repoPath: 'k8s-terraform/setup.md', hash: '#gke' });
  });
  it('ignores absolute URLs, anchors, root paths, non-markdown and paths escaping the repo', () => {
    expect(resolveRelativeMd('https://x.dev/a.md', 'a/b.md')).toBeNull();
    expect(resolveRelativeMd('#top', 'a/b.md')).toBeNull();
    expect(resolveRelativeMd('/a.md', 'a/b.md')).toBeNull();
    expect(resolveRelativeMd('k8s/', 'a/b.md')).toBeNull();
    expect(resolveRelativeMd('../../x.md', 'a/b.md')).toBeNull();
  });
});

describe('collectTreeLinks', () => {
  it('finds unique tree links across texts', () => {
    const a = `[app](${R}/tree/main/the-broken-apps/pe-assistant-app).`;
    const b = `1. [AKS](${R}/tree/main/k8s-terraform/aks)\n2. [again](${R}/tree/main/the-broken-apps/pe-assistant-app/)`;
    expect(collectTreeLinks([a, b])).toEqual(['k8s-terraform/aks', 'the-broken-apps/pe-assistant-app']);
  });
});
