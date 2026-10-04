# Agentic Field Guide Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, interactive website for this repo's labs (branded Agentic Field Guide) from the repo's own markdown, and host it on Azure Static Web Apps at `agenticfieldguide.ai`.

**Architecture:** An Astro 7 project in `site/` reads every lab `.md` file in place, using the content glob loader with `base: '..'`. It reads `README.md` to build the navigation. Three remark plugins:
- Rewrite GitHub links to site routes.
- Turn code blocks into HTML with `$VARS` marked.
- Demote markdown H1s.

Small client scripts add copy buttons, variable fill-in, search (Pagefind), the theme toggle, and the Rough.js arrow. After `astro build`, Node scripts run:
- Pagefind indexing.
- `staticwebapp.config.json` generation, with a CSP hash.
- An internal link check.

Terraform in `site/infra/` creates the Static Web App, the Azure DNS zone, and the apex custom domain. GitHub Actions builds, tests, and deploys.

**Tech Stack:**
- Site and markdown: Astro 7.3.5, `@astrojs/markdown-remark` 7.3.1, unified/remark-parse 11, Rough.js 4.6.6, Pagefind 1.5.2.
- Fonts: `@fontsource` Atkinson Hyperlegible and IBM Plex Mono, plus Excalifont, self-hosted.
- Tests and checks: Vitest 5.0.3, Playwright 1.63.0, TypeScript 6.0.3.
- Infrastructure: Terraform ≥1.12 with azurerm 5.8.0, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-04-agentic-field-guide-site-design.md`

**Deviations from the spec (deliberate, small):**
1. The CSP `script-src` adds `'wasm-unsafe-eval'`, because Pagefind runs as WebAssembly (Task 12).
2. Terraform checks live in a separate workflow, `site-infra.yml` (Task 15).
3. Rough.js draws only the home-page flow arrow. Box outlines use the CSS irregular `border-radius` that the spec already uses for static boxes, which works without JavaScript (Tasks 8 and 11).

## Global Constraints

**Toolchain and versions**
- Node `>=22.12.0`. All npm dependencies are installed with `--save-exact`, and `site/package-lock.json` is committed.
- TypeScript is pinned to **6.0.3**. `@astrojs/check` 0.9.10 requires `^5 || ^6`; do not use TypeScript 7.
- Astro 7 uses Sätteri as its default markdown engine. Remark plugins only work with **`@astrojs/markdown-remark`** installed (verified 2026-10-04).
- Every npm/Make command runs **from `site/`**. Code finds the repo with `path.resolve(process.cwd(), '..')`.

**Routing**
- Routes mirror repo paths, with a trailing slash: `a/b.md` → `/a/b/`; folder `a/b` → `/a/b/`.
- `trailingSlash: 'always'` and `build.format: 'directory'`.
- Only `https://github.com/AdminTurnedDevOps/Agentic-AI-The-Hard-Way/(blob|tree)/main/...` links and relative `.md` links are rewritten. Every other URL stays external.

**CSP and markup**
- No inline `<style>`, no inline scripts, and no `style="..."` attributes.
- The one exception is the theme script, which is allowed by SHA-256 hash.
- Astro config: `build.inlineStylesheets: 'never'` and `vite.build.assetsInlineLimit: 0`. The latter is verified to keep processed `<script>`s external.

**Variables and secrets**
- A variable is `$NAME` or `${NAME}` with `NAME` matching `[A-Z][A-Z0-9_]+`, excluding `HOME PATH USER PWD SHELL`.
- A secret is a name matching `/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/`. Secrets are never stored, never substituted, and get no input box.
- Browser storage keys: `afg:vars` and `afg:theme`. Every storage access is wrapped in `try/catch`.

**Design**
- Fonts: Excalifont for headings, wordmark, sketch labels, and buttons; Atkinson Hyperlegible for body text; IBM Plex Mono for code. Never use Inter, Roboto, Space Grotesk, Geist, Instrument Serif, or Fraunces.
- Track fills are assigned in README order to tracks with at least one real lab: blue, violet, green, peach, yellow. Zero-lab tracks get a dashed border and no fill.
- Never use: gradients, glassmorphism, centered hero, pill badges, three identical cards, decorative 01/02/03 numbering, tracked all-caps eyebrow labels, `A · B · C` meta strings, or fake window dots.
- The home page has **no work-in-progress note**.

**Content edits**
- Only the edits listed in spec section 9, plus `site/infra/tfplan` in `.gitignore`.

**Commits and Azure**
- Git commits only on branch `agentic-field-guide-site`. Stage explicit paths only; never `git add -A` or `git add .`.
- No Azure or GitHub-settings changes (`terraform apply`, `gh secret set`, pushes, PRs) without the author's explicit approval at that step.

## Review Focus

1. **Pasted values with HTML or shell metacharacters** (`<img src=x onerror=…>`, quotes, `$`) are shown and copied literally, never parsed as HTML. Covered in Task 13, `vars.spec.ts`: "value with HTML is inserted as text".
2. **A secret already in `localStorage`** (tampering, or an older build) is never shown or substituted. Covered in Task 13, `security.spec.ts`: "stored secret is ignored".
3. **`localStorage` throws** (Safari private mode, blocked site data): fill-in still works for the page session, and the theme toggle still works. Covered in Task 13, `vars.spec.ts`: "works when storage is blocked".
4. **README links with anchors, trailing slashes, or formatted link text**, such as ``[**Deploy** `kagent`](…/deploy-kagent.md#helm)`` or a `tree/main/dir/` link with a trailing slash, parse to the right route and title. Covered in Task 3 (`routes.test.ts`) and Task 5 (`readme-nav.test.ts`: "formatted link text and anchors").
5. **The same variable repeated, and the `${VAR}` form inside heredoc YAML**: every occurrence is substituted, while `export VAR=` assignment lines and `$(...)` stay untouched. Covered in Task 4 (`vars.test.ts`) and Task 13 (`vars.spec.ts`: "fills every occurrence").

---

## File map

```text
.gitignore                                   (modify) ignore build/test/tf artifacts
README.md                                    (modify) banner alt text + site link line
platform-engineering-assistant/deploy-agw.md (modify) image-syntax link → link
platform-engineering-assistant/gateway-creation-update-modelconfig.md (modify) alt text
isolated-agent/installation.md               (modify) image-syntax link → link
isolated-agent/kagent-substrate.md           (modify) image-syntax link → link
workstation-setup/a-few-key-features.md      (modify) alt text
workstation-setup/terminal.md                (modify) alt text
.github/workflows/site.yml                   build/test/deploy/close-preview
.github/workflows/site-infra.yml             terraform fmt/validate
site/
  package.json, package-lock.json, tsconfig.json, astro.config.mjs, vitest.config.ts, playwright.config.ts, Makefile, README.md
  public/favicon.svg
  public/fonts/excalifont/*.woff2, OFL.txt; public/fonts/OFL-*.txt
  scripts/write-swa-config.mjs               dist/staticwebapp.config.json (CSP hash)
  scripts/check-links.mjs                    fail on broken internal href/src in dist
  src/content.config.ts                      'pages' collection over ../**/*.md
  src/lib/routes.ts                          repo URL ↔ route mapping
  src/lib/vars.ts                            tokenize/secret/substitution (build + client)
  src/lib/code-html.ts                       code block → HTML with marked vars
  src/lib/readme-nav.ts                      README.md → SiteNav
  src/lib/content-report.ts                  orphan pages + unreferenced images (pure)
  src/lib/repo.ts                            filesystem adapters, loadSiteNav, folder files, report
  src/lib/titles.ts                          page title fallback
  src/lib/site.ts                            site name, hero heading, banner alt
  src/lib/theme-script.mjs (+ .d.mts)        inline theme script string
  src/plugins/remark-repo-links.ts, remark-code-vars.ts, remark-demote-h1.ts
  src/integrations/content-report.ts         build warnings
  src/styles/global.css
  src/layouts/Base.astro, LabLayout.astro
  src/components/NavList.astro, TrackBox.astro, Search.astro, ComingSoon.astro
  src/pages/index.astro, [...slug].astro, 404.astro
  src/scripts/main.ts, theme-toggle.ts, copy.ts, var-store.ts, var-panel.ts, image-links.ts, side-menu.ts, track-map.ts, search.ts
  tests/unit/*.test.ts                       vitest
  tests/e2e/*.spec.ts, helpers.ts            Playwright
  infra/versions.tf, main.tf, variables.tf, outputs.tf
```

---

### Task 1: Content fixes and ignores

**Files:**
- Modify: `.gitignore`, `README.md`, `platform-engineering-assistant/deploy-agw.md`, `platform-engineering-assistant/gateway-creation-update-modelconfig.md`, `isolated-agent/installation.md`, `isolated-agent/kagent-substrate.md`, `workstation-setup/a-few-key-features.md`, `workstation-setup/terminal.md`

**Interfaces:**
- Produces: repo markdown with no image syntax used for links, alt text on all 8 images, and the README site line. That line is a paragraph containing a link, which Task 5's intro rule skips.

The author edits these files often. Replace by **exact string**, not line number.

- [ ] **Step 0: Make sure the author's own edits are committed first**

Run: `git status --short -- README.md platform-engineering-assistant isolated-agent workstation-setup .gitignore`
Expected: no output. If any file is listed (for example ` M isolated-agent/installation.md`), **stop and ask the author to commit their edits**. This task's commit must contain only the edits below.

- [ ] **Step 1: Apply the string replacements**

Run from repo root:

```bash
python3 - <<'EOF'
import pathlib
def sub(path, old, new):
    p = pathlib.Path(path); s = p.read_text()
    assert s.count(old) == 1, f"{path}: expected exactly one match for {old!r}, found {s.count(old)}"
    p.write_text(s.replace(old, new))

sub("platform-engineering-assistant/deploy-agw.md", "![here](https://agentgateway.dev/", "[here](https://agentgateway.dev/")
sub("isolated-agent/installation.md", "![Agent Substrate](https://github.com/agent-substrate/substrate)", "[Agent Substrate](https://github.com/agent-substrate/substrate)")
sub("isolated-agent/kagent-substrate.md", "![here](https://kagent.dev/", "[here](https://kagent.dev/")

sub("README.md", "![](images/banner.png)", "![Agentic AI workloads architecture: AI agent, orchestrator, and task execution with feedback and human-in-the-loop review](images/banner.png)")
sub("README.md", "# Agentic AI The Hard Way\n", "# Agentic AI The Hard Way\n\nPrefer reading in a browser? Visit [agenticfieldguide.ai](https://agenticfieldguide.ai).\n")

g = "platform-engineering-assistant/gateway-creation-update-modelconfig.md"
sub(g, "![](../images/run-llama-agent.png)", "![kagent chat with the Llama-backed agent answering \"what is k8s\"](../images/run-llama-agent.png)")
sub(g, "![](../images/llama-agw-log.png)", "![agentgateway log line for the Llama request: route agentgateway-system/llama, status 200, and token usage](../images/llama-agw-log.png)")

f = "workstation-setup/a-few-key-features.md"
sub(f, "![](images/plugin1.png)", "![Claude Code with /plug typed, suggesting the /plugin command](images/plugin1.png)")
sub(f, "![](images/plugin2.png)", "![OpenAI Codex with /plu typed, suggesting the /plugins command](images/plugin2.png)")
sub(f, "![](images/plugin3.png)", "![Claude Code plugin browser listing frontend-design, superpowers, context7, code-review, and code-simplifier](images/plugin3.png)")

t = "workstation-setup/terminal.md"
sub(t, "![](images/cmux1.png)", "![cmux with project tabs for kagent, agentregistry, and agentgateway in the sidebar and a terminal open](images/cmux1.png)")
sub(t, "![](images/cmux2.png)", "![cmux with a browser tab open to a LangChain blog post next to the project sidebar](images/cmux2.png)")
EOF
```

Expected: no output and no `AssertionError`.

- [ ] **Step 2: Append ignores**

```bash
cat >> .gitignore <<'EOF'

# Agentic Field Guide site
.superpowers/
site/node_modules/
site/dist/
site/.astro/
site/test-results/
site/playwright-report/
site/infra/.terraform/
site/infra/tfplan
EOF
```

- [ ] **Step 3: Verify**

Run:

```bash
grep -rnE '!\[[^]]*\]\((https?://[^)]*)?\)' --include='*.md' --exclude-dir=.superpowers --exclude-dir=docs . | grep -vE '\.(png|jpe?g|gif|svg|webp)\)' ; echo "exit=$?"
grep -rnoE '!\[\]\(' --include='*.md' --exclude-dir=.superpowers --exclude-dir=docs . ; echo "exit=$?"
git status --short
```

Expected:
- Both greps print nothing, then `exit=1`.
- `git status` lists only the 8 markdown files and `.gitignore` as modified. `.superpowers/` no longer shows as untracked.

- [ ] **Step 4: Commit**

```bash
git add .gitignore README.md platform-engineering-assistant/deploy-agw.md platform-engineering-assistant/gateway-creation-update-modelconfig.md isolated-agent/installation.md isolated-agent/kagent-substrate.md workstation-setup/a-few-key-features.md workstation-setup/terminal.md
git commit -m "Fix image-syntax links, add image alt text, link the website

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Scaffold the Astro project

**Files:**
- Create: `site/package.json`, `site/tsconfig.json`, `site/astro.config.mjs`, `site/vitest.config.ts`, `site/src/pages/index.astro` (temporary; replaced in Task 10), `site/tests/unit/smoke.test.ts`

**Interfaces:**
- Produces: a buildable Astro project, plus `npm test` (vitest) and `npm run check` (astro check).

- [ ] **Step 1: Create package.json**

`site/package.json`:

```json
{
  "name": "agentic-field-guide",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview --port 4321",
    "check": "astro check",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Install pinned dependencies**

```bash
cd site
npm install --save-exact astro@7.3.5 @astrojs/markdown-remark@7.3.1 roughjs@4.6.6 @fontsource/atkinson-hyperlegible@5.3.0 @fontsource/ibm-plex-mono@5.3.0 unified@11.0.5 remark-parse@11.0.0 mdast-util-to-string@4.0.0 unist-util-visit@5.1.0
npm install --save-exact --save-dev pagefind@1.5.2 vitest@5.0.3 @playwright/test@1.63.0 @astrojs/check@0.9.10 typescript@6.0.3 @types/node@22.20.5 @types/mdast@4.0.4
```

Expected: `package.json` lists every package with an exact version (no `^`), and `package-lock.json` is created.

- [ ] **Step 3: Create config files**

`site/tsconfig.json`:

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist", "node_modules"]
}
```

`site/astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://agenticfieldguide.ai',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'never' },
  markdown: { syntaxHighlight: false },
  vite: {
    // Keep every processed <script> as an external file so the CSP needs no 'unsafe-inline'.
    build: { assetsInlineLimit: 0 },
    // Markdown and images live in the repo root, one level above this project.
    server: { fs: { allow: ['..'] } },
  },
});
```

`site/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'] },
});
```

`site/src/pages/index.astro` (temporary):

```astro
<html lang="en"><head><meta charset="utf-8" /><title>Agentic Field Guide</title></head><body><h1>Agentic Field Guide</h1></body></html>
```

`site/tests/unit/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Verify build, check and tests**

Run (in `site/`): `npm run build && npm run check && npm test`

Expected:
- The build ends with `Complete!` and produces `dist/index.html`.
- `astro check` reports `0 errors`.
- vitest reports `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add site/package.json site/package-lock.json site/tsconfig.json site/astro.config.mjs site/vitest.config.ts site/src/pages/index.astro site/tests/unit/smoke.test.ts
git commit -m "Scaffold Astro project for the Agentic Field Guide site

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Repo URL ↔ route mapping (`routes.ts`)

**Files:**
- Create: `site/src/lib/routes.ts`
- Test: `site/tests/unit/routes.test.ts`

**Interfaces:**
- Produces:
  - `REPO_URL: string`
  - `type TargetKind = 'file' | 'dir'`
  - `interface RepoTarget { kind: TargetKind; repoPath: string; hash: string }`
  - `parseRepoUrl(url: string): RepoTarget | null`: only this repo's `blob|tree/main` links, and `blob` only for `.md`.
  - `repoPathToRoute(repoPath: string, kind: TargetKind): string`: `README.md` → `/`.
  - `githubUrl(repoPath: string, kind: TargetKind): string`
  - `resolveRelativeMd(url: string, fromRepoPath: string): RepoTarget | null`
  - `collectTreeLinks(texts: string[]): string[]`: sorted, unique dir repo paths.

- [ ] **Step 1: Write the failing test**

`site/tests/unit/routes.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/routes.test.ts`
Expected: FAIL with `Failed to load url ../../src/lib/routes` or "does not provide an export".

- [ ] **Step 3: Implement**

`site/src/lib/routes.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/routes.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/routes.ts site/tests/unit/routes.test.ts
git commit -m "Add repo URL to site route mapping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Variable tokenizer and code-block HTML (`vars.ts`, `code-html.ts`)

**Files:**
- Create: `site/src/lib/vars.ts`, `site/src/lib/code-html.ts`
- Test: `site/tests/unit/vars.test.ts`, `site/tests/unit/code-html.test.ts`

**Interfaces:**
- Produces from `vars.ts`:
  - `type Token = { type: 'text'; value: string } | { type: 'var'; name: string; raw: string }`
  - `tokenize(text: string): Token[]`
  - `isSecret(name: string): boolean`
  - `displayValue(name: string, raw: string, values: Record<string, string>): string`
  - `varsInText(text: string): string[]`
  - `SHELL_BUILTINS: ReadonlySet<string>`
- Produces from `code-html.ts`:
  - `escapeHtml(s: string): string`
  - `renderCodeBlock(code: string, lang?: string | null, title?: string): string`. Output shape: `<figure class="code" data-lang="…"><figcaption class="code-title">…</figcaption><pre><code>…<span class="var" data-var="NAME" data-raw="$NAME">$NAME</span>…</code></pre></figure>`.

- [ ] **Step 1: Write the failing tests**

`site/tests/unit/vars.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { displayValue, isSecret, tokenize, varsInText } from '../../src/lib/vars';

describe('tokenize', () => {
  it('finds $VAR and ${VAR}', () => {
    expect(tokenize('curl "$INGRESS_GW_ADDRESS:8080/ollama"')).toEqual([
      { type: 'text', value: 'curl "' },
      { type: 'var', name: 'INGRESS_GW_ADDRESS', raw: '$INGRESS_GW_ADDRESS' },
      { type: 'text', value: ':8080/ollama"' },
    ]);
    expect(tokenize('gs://${BUCKET_NAME}/x')).toEqual([
      { type: 'text', value: 'gs://' },
      { type: 'var', name: 'BUCKET_NAME', raw: '${BUCKET_NAME}' },
      { type: 'text', value: '/x' },
    ]);
  });
  it('leaves assignments, command substitution, lowercase and shell builtins as text', () => {
    const text = 'export INGRESS_GW_ADDRESS=$(kubectl get svc)\necho $HOME $sid $i';
    expect(tokenize(text)).toEqual([{ type: 'text', value: text }]);
  });
  it('marks every occurrence, including inside heredoc YAML', () => {
    const text = 'stringData:\n  Authorization: $ANTHROPIC_API_KEY\n  OPENAI_API_KEY: ${ANTHROPIC_API_KEY}\n';
    const vars = tokenize(text).filter((t) => t.type === 'var');
    expect(vars).toEqual([
      { type: 'var', name: 'ANTHROPIC_API_KEY', raw: '$ANTHROPIC_API_KEY' },
      { type: 'var', name: 'ANTHROPIC_API_KEY', raw: '${ANTHROPIC_API_KEY}' },
    ]);
  });
  it('round-trips: joining tokens reproduces the input', () => {
    const text = 'a $X_Y b ${Z1} $HOME c';
    expect(tokenize(text).map((t) => (t.type === 'text' ? t.value : t.raw)).join('')).toBe(text);
  });
});

describe('isSecret', () => {
  it('flags key/token/secret/password/credential names', () => {
    for (const n of ['ANTHROPIC_API_KEY', 'GH_TOKEN', 'CLIENT_SECRET', 'DB_PASSWORD', 'AWS_CREDENTIALS']) expect(isSecret(n)).toBe(true);
    for (const n of ['INGRESS_GW_ADDRESS', 'BUCKET_NAME', 'PROJECT_ID']) expect(isSecret(n)).toBe(false);
  });
});

describe('displayValue', () => {
  it('substitutes filled, non-secret values', () => {
    expect(displayValue('INGRESS_GW_ADDRESS', '$INGRESS_GW_ADDRESS', { INGRESS_GW_ADDRESS: '20.84.113.7' })).toBe('20.84.113.7');
  });
  it('keeps the raw text for blank values and for secrets', () => {
    expect(displayValue('X_Y', '${X_Y}', { X_Y: '   ' })).toBe('${X_Y}');
    expect(displayValue('X_Y', '$X_Y', {})).toBe('$X_Y');
    expect(displayValue('OPENAI_API_KEY', '$OPENAI_API_KEY', { OPENAI_API_KEY: 'sk-leak' })).toBe('$OPENAI_API_KEY');
  });
});

describe('varsInText', () => {
  it('lists unique names in order of first use', () => {
    expect(varsInText('$B $A ${B} $HOME')).toEqual(['B', 'A']);
  });
});
```

`site/tests/unit/code-html.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { escapeHtml, renderCodeBlock } from '../../src/lib/code-html';

describe('escapeHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">&</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});

describe('renderCodeBlock', () => {
  it('wraps vars in spans and escapes everything else', () => {
    expect(renderCodeBlock('echo "<b>" $FOO', 'bash')).toBe(
      '<figure class="code" data-lang="bash"><pre><code>echo &quot;&lt;b&gt;&quot; <span class="var" data-var="FOO" data-raw="$FOO">$FOO</span></code></pre></figure>',
    );
  });
  it('adds a title and omits data-lang when no language', () => {
    expect(renderCodeBlock('x', null, 'main.tf')).toBe(
      '<figure class="code"><figcaption class="code-title">main.tf</figcaption><pre><code>x</code></pre></figure>',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/vars.test.ts tests/unit/code-html.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`site/src/lib/vars.ts`:

```ts
export type Token = { type: 'text'; value: string } | { type: 'var'; name: string; raw: string };

const VAR_RE = /\$\{([A-Z][A-Z0-9_]+)\}|\$([A-Z][A-Z0-9_]+)/g;
const SECRET_RE = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/;

export const SHELL_BUILTINS: ReadonlySet<string> = new Set(['HOME', 'PATH', 'USER', 'PWD', 'SHELL']);

/** Split text into plain text and `$NAME` / `${NAME}` variable references. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of text.matchAll(VAR_RE)) {
    const name = match[1] ?? match[2];
    if (SHELL_BUILTINS.has(name)) continue;
    const start = match.index ?? 0;
    if (start > last) tokens.push({ type: 'text', value: text.slice(last, start) });
    tokens.push({ type: 'var', name, raw: match[0] });
    last = start + match[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) });
  return tokens;
}

export function isSecret(name: string): boolean {
  return SECRET_RE.test(name);
}

/** What a variable shows in code: the reader's value, or the original text for blanks and secrets. */
export function displayValue(name: string, raw: string, values: Record<string, string>): string {
  const value = values[name];
  if (isSecret(name) || !value || !value.trim()) return raw;
  return value;
}

export function varsInText(text: string): string[] {
  const names: string[] = [];
  for (const token of tokenize(text)) {
    if (token.type === 'var' && !names.includes(token.name)) names.push(token.name);
  }
  return names;
}
```

`site/src/lib/code-html.ts`:

```ts
import { tokenize } from './vars';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Render a code block as HTML. Variables become spans the client fills in. */
export function renderCodeBlock(code: string, lang?: string | null, title?: string): string {
  const body = tokenize(code)
    .map((token) =>
      token.type === 'text'
        ? escapeHtml(token.value)
        : `<span class="var" data-var="${token.name}" data-raw="${escapeHtml(token.raw)}">${escapeHtml(token.raw)}</span>`,
    )
    .join('');
  const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
  const caption = title ? `<figcaption class="code-title">${escapeHtml(title)}</figcaption>` : '';
  return `<figure class="code"${langAttr}>${caption}<pre><code>${body}</code></pre></figure>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/vars.test.ts tests/unit/code-html.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/vars.ts site/src/lib/code-html.ts site/tests/unit/vars.test.ts site/tests/unit/code-html.test.ts
git commit -m "Add variable tokenizer and code block renderer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: README → navigation (`readme-nav.ts`)

**Files:**
- Create: `site/src/lib/readme-nav.ts`
- Test: `site/tests/unit/readme-nav.test.ts`

**Interfaces:**
- Consumes: `parseRepoUrl`, `repoPathToRoute`, `TargetKind` (Task 3).
- Produces (later tasks rely on these exact names):

```ts
export interface LabItem { type: 'lab'; title: string; repoPath: string; kind: TargetKind; route: string; comingSoon: boolean; notes: string[]; children: NavItem[] }
export interface SoonItem { type: 'soon'; title: string; notes: string[]; children: NavItem[] }
export interface ExternalItem { type: 'external'; title: string; url: string; notes: string[]; children: NavItem[] }
export interface GroupItem { type: 'group'; title: string; children: NavItem[] }
export type NavItem = LabItem | SoonItem | ExternalItem | GroupItem;
export type TrackColor = 'blue' | 'violet' | 'green' | 'peach' | 'yellow';
export interface NavGroup { kind: 'track' | 'section'; title: string; slug: string; blurb: string | null; color: TrackColor | null; beforeYouStart: NavItem[]; items: NavItem[] }
export interface SiteNav { intro: string; startHere: NavGroup; sections: NavGroup[]; tracks: NavGroup[] }
export interface RepoFs { exists(repoPath: string, kind: TargetKind): boolean; isEmpty(repoPath: string): boolean }
export class ReadmeNavError extends Error {}
export function parseReadmeNav(markdown: string, fs: RepoFs): SiteNav
export function flattenLabs(group: NavGroup): LabItem[]        // README order, skips coming-soon
export function allLabs(group: NavGroup): LabItem[]            // includes coming-soon labs
export function firstLabRoute(group: NavGroup): string | null
export function countItems(group: NavGroup): { labs: number; soon: number }
export function findGroupForRoute(nav: SiteNav, route: string): { group: NavGroup; item: LabItem } | null
export function navRepoPaths(nav: SiteNav): Set<string>        // repoPaths of every lab item (file kind)
export function slugify(title: string): string
```

**Rules** (spec 5.1):
- Walk linearly from `## Labs` to the end of the file. `##` starts a section; `###` starts a track wherever it appears.
- A paragraph link inside a track is a "before you start" item. Paragraph links in a section are items.
- A list under `## Labs` before any `###` throws.
- A list item without a link but with linked descendants is a group. A nested item with no link anywhere is a note.
- An empty URL is a `soon` item. A repo link to an empty file is a lab with `comingSoon: true`. A repo link to a missing path throws, naming `README.md:<line>`. A non-repo URL is an `external` item.
- Intro is the first paragraph after the H1 that contains no link.
- Blurb: the first `## The Scenarios` `###` whose title is a case-insensitive prefix of the track title. Fallback is the track's first link-free paragraph, else `null`.
- Colors: tracks with `flattenLabs(...).length > 0` get `blue, violet, green, peach, yellow` in order.

- [ ] **Step 1: Write the failing test**

`site/tests/unit/readme-nav.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  allLabs, countItems, findGroupForRoute, firstLabRoute, flattenLabs, navRepoPaths, parseReadmeNav, ReadmeNavError, slugify, type RepoFs,
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

describe('parseReadmeNav: structure', () => {
  it('takes the intro from the first link-free paragraph after the title', () => {
    expect(nav().intro).toBe('Intro paragraph with no links.');
  });
  it('walks past a ## section that sits between ## Labs and the first track', () => {
    const n = nav();
    expect(n.startHere.items.map((i) => i.type === 'lab' && i.route)).toEqual(['/prerequisites/']);
    expect(n.sections.map((s) => s.title)).toEqual(['AI Workstation Setup']);
    expect(n.tracks.map((t) => t.title)).toEqual(['Alpha Track', 'Isolated Agents With kagent + Substrate', 'Isolated Environments', 'Beta Track']);
  });
  it('nests sub-items under their parent', () => {
    const laptop = nav().sections[0].items[0];
    expect(laptop.type).toBe('lab');
    expect(laptop.children.map((c) => c.type === 'lab' && c.route)).toEqual(['/workstation-setup/keys/']);
  });
  it('turns prereq paragraph links into before-you-start items', () => {
    const [alpha, iso] = nav().tracks;
    expect(alpha.beforeYouStart).toEqual([{ type: 'soon', title: 'Hardware decisions', notes: [], children: [] }]);
    expect(iso.beforeYouStart.map((i) => i.type === 'lab' && i.route)).toEqual(['/iso/learn/']);
  });
  it('handles folder links, notes, empty files, groups, soon items and external links', () => {
    const items = nav().tracks[0].items;
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
  it('matches scenario blurbs by prefix and falls back to the first plain paragraph', () => {
    const [alpha, iso, envs, beta] = nav().tracks;
    expect(alpha.blurb).toBe('Alpha scenario blurb.');
    expect(iso.blurb).toBe('Isolated blurb.');
    expect(envs.blurb).toBe('WIP');
    expect(beta.blurb).toBeNull();
  });
  it('colors only tracks with real labs, in README order', () => {
    expect(nav().tracks.map((t) => t.color)).toEqual(['blue', 'violet', null, 'green']);
  });
  it('slugifies titles', () => {
    expect(slugify('Isolated Agents With kagent + Agent substrate')).toBe('isolated-agents-with-kagent-agent-substrate');
  });
});

describe('parseReadmeNav: errors', () => {
  it('names the README line of a link to a missing file', () => {
    const md = `# T\n\nIntro.\n\n## Labs\n\n### A\n\n1. [Gone](${R}/blob/main/gone.md)\n`;
    expect(() => parseReadmeNav(md, stubFs({}))).toThrow(/README\.md:9: "Gone" links to gone\.md, which does not exist/);
  });
  it('rejects a list under ## Labs before any track', () => {
    const md = `# T\n\nIntro.\n\n## Labs\n\n1. [A](${R}/blob/main/a.md)\n`;
    expect(() => parseReadmeNav(md, stubFs({ 'a.md': 'x' }))).toThrow(ReadmeNavError);
  });
  it('rejects a README without ## Labs', () => {
    expect(() => parseReadmeNav('# T\n\nIntro.\n', stubFs({}))).toThrow(/no "## Labs" heading/);
  });
});

describe('formatted link text and anchors', () => {
  it('uses plain link text as the title and keeps the route anchor-free', () => {
    const md = `# T\n\nIntro.\n\n## Labs\n\n### A\n\n1. [**Deploy** \`kagent\`](${R}/blob/main/a.md#helm)\n`;
    const item = parseReadmeNav(md, stubFs({ 'a.md': 'x' })).tracks[0].items[0];
    expect(item).toMatchObject({ type: 'lab', title: 'Deploy kagent', route: '/a/' });
  });
});

describe('helpers', () => {
  it('flattens labs in README order, skipping coming-soon', () => {
    expect(flattenLabs(nav().tracks[0]).map((l) => l.route)).toEqual(['/the-broken-apps/app/', '/alpha/deploy-gw/']);
    expect(allLabs(nav().tracks[0]).map((l) => l.route)).toContain('/alpha/vllm/');
  });
  it('finds first lab, counts, and the group for a route', () => {
    const n = nav();
    expect(firstLabRoute(n.tracks[1])).toBe('/iso/learn/');
    expect(firstLabRoute(n.tracks[2])).toBeNull();
    expect(countItems(n.tracks[0])).toEqual({ labs: 2, soon: 5 });
    expect(findGroupForRoute(n, '/alpha/deploy-gw/')?.group.title).toBe('Alpha Track');
    expect(findGroupForRoute(n, '/workstation-setup/keys/')?.group.title).toBe('AI Workstation Setup');
    expect(findGroupForRoute(n, '/nope/')).toBeNull();
    expect(navRepoPaths(n).has('iso/install.md')).toBe(true);
  });
});

describe('the real README', () => {
  it('parses without errors and yields tracks with labs', () => {
    const root = path.resolve(process.cwd(), '..');
    const real: RepoFs = {
      exists: (p, kind) => fs.existsSync(path.join(root, p)) && (kind === 'dir' ? fs.statSync(path.join(root, p)).isDirectory() : fs.statSync(path.join(root, p)).isFile()),
      isEmpty: (p) => fs.readFileSync(path.join(root, p), 'utf8').trim() === '',
    };
    const n = parseReadmeNav(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), real);
    expect(n.intro.length).toBeGreaterThan(40);
    expect(n.tracks.length).toBeGreaterThan(0);
    expect(n.tracks.some((t) => flattenLabs(t).length > 0)).toBe(true);
    expect(n.startHere.items.length).toBeGreaterThan(0);
  });
});
```

Counts check for `countItems(alpha)`:
- **labs = 2:** broken app and deploy-gw.
- **soon = 5:** Hardware decisions (before you start), vLLM (empty file), Prompt guards, Metrics, and Agent Identity.
- The external item and the group are not counted.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/readme-nav.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`site/src/lib/readme-nav.ts`:

```ts
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
      if (links.length === 0) {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/readme-nav.test.ts`
Expected: PASS. If the README line-number test fails, count the fixture lines; the link line is line 9.

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/readme-nav.ts site/tests/unit/readme-nav.test.ts
git commit -m "Parse README.md into the site navigation model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Remark plugins (links, code variables, H1 demotion)

**Files:**
- Create: `site/src/plugins/remark-repo-links.ts`, `site/src/plugins/remark-code-vars.ts`, `site/src/plugins/remark-demote-h1.ts`
- Modify: `site/astro.config.mjs` (full file below)
- Test: `site/tests/unit/remark-plugins.test.ts`

**Interfaces:**
- Consumes: `parseRepoUrl`, `resolveRelativeMd`, `repoPathToRoute` (Task 3) and `renderCodeBlock` (Task 4).
- Produces:
  - `remarkRepoLinks(options: { repoRoot: string; exists?: (repoPath: string, kind: TargetKind) => boolean })`
  - `remarkCodeVars()`
  - `remarkDemoteH1()`
  - All three are unified attachers; the transformer receives `(tree: Root, file: { path?: string })`.

- [ ] **Step 1: Write the failing test**

`site/tests/unit/remark-plugins.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Heading, Html, Link, Root } from 'mdast';
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/remark-plugins.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`site/src/plugins/remark-repo-links.ts`:

```ts
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
```

`site/src/plugins/remark-code-vars.ts`:

```ts
import { visit } from 'unist-util-visit';
import type { Code, Html, Root } from 'mdast';
import { renderCodeBlock } from '../lib/code-html';

/** Replace fenced code with HTML whose $VARS the client can fill in. */
export function remarkCodeVars() {
  return (tree: Root) => {
    visit(tree, 'code', (node: Code, index, parent) => {
      if (!parent || index === undefined) return;
      const html: Html = { type: 'html', value: renderCodeBlock(node.value, node.lang) };
      parent.children.splice(index, 1, html);
    });
  };
}
```

`site/src/plugins/remark-demote-h1.ts`:

```ts
import { visit } from 'unist-util-visit';
import type { Heading, Root } from 'mdast';

/** The page layout renders the lab title as the only H1. */
export function remarkDemoteH1() {
  return (tree: Root) => {
    visit(tree, 'heading', (node: Heading) => {
      if (node.depth === 1) node.depth = 2;
    });
  };
}
```

`site/astro.config.mjs` (full file):

```js
import path from 'node:path';
import { defineConfig } from 'astro/config';
import { remarkRepoLinks } from './src/plugins/remark-repo-links.ts';
import { remarkCodeVars } from './src/plugins/remark-code-vars.ts';
import { remarkDemoteH1 } from './src/plugins/remark-demote-h1.ts';

const REPO_ROOT = path.resolve(process.cwd(), '..');

export default defineConfig({
  site: 'https://agenticfieldguide.ai',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'never' },
  markdown: {
    syntaxHighlight: false,
    remarkPlugins: [[remarkRepoLinks, { repoRoot: REPO_ROOT }], remarkCodeVars, remarkDemoteH1],
  },
  vite: {
    // Keep every processed <script> as an external file so the CSP needs no 'unsafe-inline'.
    build: { assetsInlineLimit: 0 },
    // Markdown and images live in the repo root, one level above this project.
    server: { fs: { allow: ['..'] } },
  },
});
```

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run tests/unit/remark-plugins.test.ts && npm run build`
Expected: tests PASS. The build still completes; the plugins are loaded but no markdown pages exist yet.

- [ ] **Step 5: Commit**

```bash
git add site/src/plugins site/tests/unit/remark-plugins.test.ts site/astro.config.mjs
git commit -m "Add remark plugins for repo links, code variables and H1 demotion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Repo adapters, content report and page titles

**Files:**
- Create: `site/src/lib/content-report.ts`, `site/src/lib/repo.ts`, `site/src/lib/titles.ts`, `site/src/integrations/content-report.ts`
- Modify: `site/astro.config.mjs` (full file below)
- Test: `site/tests/unit/content-report.test.ts`, `site/tests/unit/repo.test.ts`, `site/tests/unit/titles.test.ts`

**Interfaces:**
- Consumes: `parseReadmeNav`, `navRepoPaths`, `RepoFs`, `SiteNav` (Task 5) and `collectTreeLinks` (Task 3).
- Produces:
  - From `content-report.ts`:
    - `findImageRefs(markdown: string, fromRepoPath: string): string[]`
    - `findOrphanPages(mdRepoPaths: string[], navPaths: ReadonlySet<string>, folderDirs: string[]): string[]`
    - `findUnreferencedImages(imageRepoPaths: string[], referenced: ReadonlySet<string>): string[]`
  - From `repo.ts`:
    - `REPO_ROOT: string`
    - `IMAGE_EXTS: string[]`
    - `CODE_EXTS: Record<string, string>`
    - `walkRepo(root: string, exts: string[]): string[]`
    - `repoFs(root: string): RepoFs`
    - `loadSiteNav(root?: string): SiteNav`
    - `folderDirs(root?: string): string[]`
    - `interface FolderCodeFile { name: string; lang: string; text: string }`
    - `folderFiles(root: string, dir: string): { md: string[]; code: FolderCodeFile[] }`
    - `buildContentReport(root?: string): { orphans: string[]; unreferencedImages: string[] }`
  - From `titles.ts`: `pageTitle(navTitle: string | null, body: string, repoPath: string): string`
  - From `integrations/content-report.ts`: `contentReport(options: { repoRoot: string }): AstroIntegration`

- [ ] **Step 1: Write the failing tests**

`site/tests/unit/content-report.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { findImageRefs, findOrphanPages, findUnreferencedImages } from '../../src/lib/content-report';

describe('findImageRefs', () => {
  it('resolves relative image paths and skips URLs and empty refs', () => {
    const md = '![a](../images/x.png) ![](images/y.png "t") ![e]() ![w](https://x.dev/z.png)';
    expect(findImageRefs(md, 'lab/page.md')).toEqual(['images/x.png', 'lab/images/y.png']);
  });
});

describe('findOrphanPages', () => {
  it('lists markdown that is neither in the nav nor inside a linked folder', () => {
    const md = ['a/in-nav.md', 'a/orphan.md', 'apps/app/setup.md'];
    expect(findOrphanPages(md, new Set(['a/in-nav.md']), ['apps/app'])).toEqual(['a/orphan.md']);
  });
});

describe('findUnreferencedImages', () => {
  it('lists images nothing references', () => {
    expect(findUnreferencedImages(['i/a.png', 'i/b.png'], new Set(['i/a.png']))).toEqual(['i/b.png']);
  });
});
```

`site/tests/unit/repo.test.ts`:

```ts
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
  it('lists a folder’s markdown and code files, sorted, skipping dotfiles', () => {
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
```

`site/tests/unit/titles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pageTitle } from '../../src/lib/titles';

describe('pageTitle', () => {
  it('prefers the README title', () => {
    expect(pageTitle('Deploy kagent', '# Installation', 'x/deploy-kagent.md')).toBe('Deploy kagent');
  });
  it('falls back to the first H1 outside code fences', () => {
    expect(pageTitle(null, '```bash\n# a comment\n```\n\n# Real Title\n', 'x/y.md')).toBe('Real Title');
  });
  it('falls back to the file name', () => {
    expect(pageTitle(null, 'no heading', 'platform-engineering-assistant/prompt-guard.md')).toBe('Prompt guard');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/content-report.test.ts tests/unit/repo.test.ts tests/unit/titles.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`site/src/lib/content-report.ts`:

```ts
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
```

`site/src/lib/repo.ts`:

```ts
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
```

`site/src/lib/titles.ts`:

```ts
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
```

`site/src/integrations/content-report.ts`:

```ts
import type { AstroIntegration } from 'astro';
import { buildContentReport } from '../lib/repo';

/** Warn about pages missing from the README and images nothing uses. */
export function contentReport(options: { repoRoot: string }): AstroIntegration {
  return {
    name: 'afg-content-report',
    hooks: {
      'astro:build:done': ({ logger }) => {
        const report = buildContentReport(options.repoRoot);
        for (const page of report.orphans) logger.warn(`not linked from README.md (built, not in navigation): ${page}`);
        for (const image of report.unreferencedImages) logger.warn(`image not referenced by any markdown: ${image}`);
      },
    },
  };
}
```

`site/astro.config.mjs` (full file):

```js
import path from 'node:path';
import { defineConfig } from 'astro/config';
import { remarkRepoLinks } from './src/plugins/remark-repo-links.ts';
import { remarkCodeVars } from './src/plugins/remark-code-vars.ts';
import { remarkDemoteH1 } from './src/plugins/remark-demote-h1.ts';
import { contentReport } from './src/integrations/content-report.ts';

const REPO_ROOT = path.resolve(process.cwd(), '..');

export default defineConfig({
  site: 'https://agenticfieldguide.ai',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'never' },
  markdown: {
    syntaxHighlight: false,
    remarkPlugins: [[remarkRepoLinks, { repoRoot: REPO_ROOT }], remarkCodeVars, remarkDemoteH1],
  },
  integrations: [contentReport({ repoRoot: REPO_ROOT })],
  vite: {
    // Keep every processed <script> as an external file so the CSP needs no 'unsafe-inline'.
    build: { assetsInlineLimit: 0 },
    // Markdown and images live in the repo root, one level above this project.
    server: { fs: { allow: ['..'] } },
  },
});
```

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected:
- All unit tests PASS.
- The build log contains `not linked from README.md ...: platform-engineering-assistant/prompt-guard.md`.
- The build log also contains `image not referenced ...: isolated-agent/images/1.png` (and the other two).

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/content-report.ts site/src/lib/repo.ts site/src/lib/titles.ts site/src/integrations site/tests/unit/content-report.test.ts site/tests/unit/repo.test.ts site/tests/unit/titles.test.ts site/astro.config.mjs
git commit -m "Add repo adapters, content report warnings and page titles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Fonts, global styles, theme script and base layout

**Files:**
- Create:
  - `site/public/fonts/excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2`, `.../Excalifont-Regular-be310b9bcd4f1a43f571c46df7809174.woff2`, `site/public/fonts/excalifont/OFL.txt`
  - `site/public/fonts/OFL-AtkinsonHyperlegible.txt`, `site/public/fonts/OFL-IBMPlexMono.txt`, `site/public/favicon.svg`
  - `site/src/lib/site.ts`, `site/src/lib/theme-script.mjs`, `site/src/lib/theme-script.d.mts`
  - `site/src/styles/global.css`
  - `site/src/layouts/Base.astro`
  - `site/src/components/Search.astro`
  - `site/src/scripts/main.ts`, `site/src/scripts/theme-toggle.ts`
- Modify: `site/src/pages/index.astro` (temporary: uses `Base`)

**Interfaces:**
- Consumes: `loadSiteNav` (Task 7), `firstLabRoute` (Task 5), `REPO_URL` (Task 3).
- Produces:
  - `Base.astro` with props `{ title?: string; description?: string }` and a default slot inside `<main id="main">`.
  - `THEME_SCRIPT: string`
  - `SITE_NAME`, `HERO_HEADING`, `BANNER_ALT`
  - CSS classes used by later tasks: `.sk`, `.sk-alt`, `.fill-{blue|violet|green|peach|yellow}`, `.is-empty`, `.prose`, `figure.code`, `.var`, `.var.is-set`, `.copy-btn`, `.sticky-note`, `.nav-list`, `.lab-layout`, `.hero`, `.flow`, `.tracks`, `.track`, `.is-big`, `.coming-soon`, `.search-results`, `.visually-hidden`.

- [ ] **Step 1: Fetch Excalifont (Latin subsets) and license texts**

Run in `site/`:

```bash
mkdir -p public/fonts/excalifont
BASE=https://raw.githubusercontent.com/excalidraw/excalidraw/ed10ac7dca7e40f3f4a31269b4bfba980d0db41e/packages/excalidraw/fonts/Excalifont
for f in a88b72a24fb54c9f94e3b5fdaa7481c9 be310b9bcd4f1a43f571c46df7809174; do
  curl -fsSL -o "public/fonts/excalifont/Excalifont-Regular-$f.woff2" "$BASE/Excalifont-Regular-$f.woff2"
done
curl -fsSL "$BASE/index.ts" | sed -n '/^copyright:/,/^licenseURL:/p' > public/fonts/excalifont/OFL.txt
cp node_modules/@fontsource/atkinson-hyperlegible/LICENSE public/fonts/OFL-AtkinsonHyperlegible.txt
cp node_modules/@fontsource/ibm-plex-mono/LICENSE public/fonts/OFL-IBMPlexMono.txt
file public/fonts/excalifont/*.woff2; head -2 public/fonts/excalifont/OFL.txt
```

Expected:
- Both files report `Web Open Font Format (Version 2)`.
- `OFL.txt` starts with `copyright: Copyright (c) 2024 by Excalidraw.`

- [ ] **Step 2: Site constants and theme script**

`site/src/lib/site.ts`:

```ts
export const SITE_NAME = 'Agentic Field Guide';
export const HERO_HEADING = 'Agentic AI For The Field.';
export const BANNER_ALT =
  'Agentic AI workloads architecture: AI agent, orchestrator, and task execution with feedback and human-in-the-loop review';
export const SITE_DESCRIPTION =
  'Hands-on labs for running AI agents on Kubernetes: kagent, agentgateway, MCP, Agent Substrate, and more.';
```

`site/src/lib/theme-script.mjs`:

```js
// Runs before first paint so a saved theme applies without a flash. Its SHA-256 hash is allowed in the CSP.
export const THEME_SCRIPT =
  "(function(){try{var t=localStorage.getItem('afg:theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;}catch(e){}})();";
```

`site/src/lib/theme-script.d.mts`:

```ts
export declare const THEME_SCRIPT: string;
```

- [ ] **Step 3: Global stylesheet**

`site/src/styles/global.css`:

```css
@font-face {
  font-family: 'Excalifont';
  src: url('/fonts/excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2') format('woff2');
  font-display: swap;
  unicode-range: U+20-7e, U+a0-a3, U+a5-a6, U+a8-ab, U+ad-b1, U+b4, U+b6-b8, U+ba-ff, U+131, U+152-153, U+2bc, U+2c6, U+2da, U+2dc, U+304, U+308, U+2013-2014, U+2018-201a, U+201c-201e, U+2020, U+2022, U+2024-2026, U+2030, U+2039-203a, U+20ac, U+2122, U+2212;
}
@font-face {
  font-family: 'Excalifont';
  src: url('/fonts/excalifont/Excalifont-Regular-be310b9bcd4f1a43f571c46df7809174.woff2') format('woff2');
  font-display: swap;
  unicode-range: U+100-130, U+132-137, U+139-149, U+14c-151, U+154-17e, U+192, U+1fc-1ff, U+218-21b, U+237, U+1e80-1e85, U+1ef2-1ef3, U+2113;
}

:root {
  --paper: #ffffff;
  --ink: #1e1e1e;
  --muted: #5c636a;
  --rule: #1e1e1e;
  --link: #1864ab;
  --focus: #e8590c;
  --loop: #e8590c;
  --start-fill: #e9ecef;
  --code-bg: #1e1e1e;
  --code-ink: #e9ecef;
  --var-empty: #ffec99;
  --var-set: #b2f2bb;
  --fill-blue: #a5d8ff;
  --fill-violet: #d0bfff;
  --fill-green: #b2f2bb;
  --fill-peach: #ffd8a8;
  --fill-yellow: #ffec99;
  --sticky: #ffec99;
  --sticky-ink: #1e1e1e;
  --font-hand: 'Excalifont', 'Segoe Print', cursive;
  --font-body: 'Atkinson Hyperlegible', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', monospace;
  --radius-a: 255px 14px 225px 14px / 14px 225px 14px 255px;
  --radius-b: 14px 225px 14px 255px / 255px 14px 225px 14px;
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --paper: #121212; --ink: #e3e3e8; --muted: #a0a6ad; --rule: #e3e3e8; --link: #74c0fc;
    --focus: #ff922b; --loop: #ff922b; --start-fill: #2a2a2e; --code-bg: #0b0b0c;
    --fill-blue: #154163; --fill-violet: #3f2f72; --fill-green: #1f4d2a; --fill-peach: #5a3a17; --fill-yellow: #5c4d0e;
    --sticky: #5c4d0e; --sticky-ink: #fff3bf;
    color-scheme: dark;
  }
}
:root[data-theme='dark'] {
  --paper: #121212; --ink: #e3e3e8; --muted: #a0a6ad; --rule: #e3e3e8; --link: #74c0fc;
  --focus: #ff922b; --loop: #ff922b; --start-fill: #2a2a2e; --code-bg: #0b0b0c;
  --fill-blue: #154163; --fill-violet: #3f2f72; --fill-green: #1f4d2a; --fill-peach: #5a3a17; --fill-yellow: #5c4d0e;
  --sticky: #5c4d0e; --sticky-ink: #fff3bf;
  color-scheme: dark;
}

*, *::before, *::after { box-sizing: border-box; }
html { background: var(--paper); color: var(--ink); }
body { margin: 0; font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.6; background: var(--paper); color: var(--ink); }
a { color: var(--link); text-underline-offset: 3px; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
h1, h2, h3 { font-family: var(--font-hand); font-weight: 400; line-height: 1.15; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.skip-link { position: absolute; left: -9999px; }
.skip-link:focus { left: 1rem; top: 1rem; background: var(--paper); padding: .4rem .8rem; z-index: 20; }

.sk { border: 2px solid var(--rule); border-radius: var(--radius-a); }
.sk-alt { border: 2px solid var(--rule); border-radius: var(--radius-b); }
.fill-blue { background: var(--fill-blue); }
.fill-violet { background: var(--fill-violet); }
.fill-green { background: var(--fill-green); }
.fill-peach { background: var(--fill-peach); }
.fill-yellow { background: var(--fill-yellow); }

/* Header and footer */
.site-header { display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap; padding: .85rem clamp(1rem, 3vw, 2rem); border-bottom: 2px solid var(--rule); }
.wordmark { font-family: var(--font-hand); font-size: 1.7rem; color: var(--ink); text-decoration: none; margin-right: auto; }
.site-nav { display: flex; gap: 1.1rem; flex-wrap: wrap; }
.site-nav a { color: var(--ink); text-decoration: none; }
.site-nav a:hover { text-decoration: underline; }
.search { position: relative; }
.search input { font: inherit; font-size: .9rem; padding: .3rem .8rem; width: 13rem; background: var(--paper); color: var(--ink); }
.search-results { position: absolute; right: 0; top: calc(100% + .4rem); width: min(26rem, 90vw); list-style: none; margin: 0; padding: .4rem; background: var(--paper); z-index: 10; max-height: 70vh; overflow: auto; }
.search-results a { display: block; padding: .5rem .6rem; color: var(--ink); text-decoration: none; }
.search-results a:hover, .search-results a:focus-visible { background: var(--start-fill); }
.search-results strong { display: block; font-family: var(--font-hand); font-weight: 400; font-size: 1.15rem; }
.search-excerpt { font-size: .85rem; color: var(--muted); }
.search-results mark { background: var(--fill-yellow); color: var(--ink); }
.search-msg { padding: .5rem .6rem; color: var(--muted); font-size: .9rem; }
.theme-toggle { font-family: var(--font-hand); font-size: 1rem; background: transparent; color: var(--ink); padding: .15rem .8rem; cursor: pointer; }
main { padding: 0 clamp(1rem, 3vw, 2rem) 3rem; }
.site-footer { border-top: 2px solid var(--rule); padding: 1rem clamp(1rem, 3vw, 2rem); font-size: .85rem; color: var(--muted); display: flex; gap: 1.5rem; flex-wrap: wrap; }
.site-footer a { color: inherit; }

/* Home */
.hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 2rem; align-items: center; padding: 2rem 0 1rem; }
.hero h1 { font-size: clamp(2.4rem, 5vw, 3.4rem); margin: 0 0 .75rem; }
.hero p { max-width: 46ch; font-size: 1.1rem; margin: 0; }
.hero-banner { width: 100%; height: auto; display: block; border-radius: 6px; }
.scenarios h2, .workstation h2 { font-size: 2rem; margin: 1.5rem 0 1rem; }
.flow { display: grid; grid-template-columns: 13rem 3.5rem minmax(0, 1fr); align-items: start; gap: .5rem; }
.start { padding: 1rem 1.1rem; background: var(--start-fill); }
.start h3 { margin: 0 0 .4rem; font-size: 1.35rem; }
.start .nav-list a { color: var(--ink); }
.flow-arrow { width: 100%; height: 2.5rem; margin-top: 2.2rem; color: var(--ink); }
.flow-arrow text { font-family: var(--font-hand); font-size: 28px; fill: currentColor; }
.tracks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-flow: dense; gap: 1rem; }
.track { padding: 1rem 1.2rem; cursor: pointer; }
.track.is-big { grid-row: span 2; }
.track.is-empty { border-style: dashed; color: var(--muted); cursor: default; }
.track h3 { margin: 0 0 .3rem; font-size: 1.45rem; }
.track h3 a, .track .nav-list a { color: var(--ink); }
.track h3 a { text-decoration: none; }
.track h3 a:hover { text-decoration: underline; }
.track-blurb { margin: 0 0 .5rem; font-size: .95rem; }
.track-count { margin: .6rem 0 0; font-size: .85rem; }
.workstation .nav-list { columns: 2; }

/* Nav lists */
.nav-list { margin: .3rem 0; padding-left: 1.2rem; }
.nav-list li { margin: .3rem 0; }
.nav-list.compact { font-size: .92rem; }
.nav-list.compact li { margin: .15rem 0; }
.is-soon, a.is-soon { font-style: italic; color: var(--muted); }
.soon-tag { font-size: .85em; }
.nav-note { margin: .1rem 0 .2rem; font-size: .82rem; color: var(--muted); }
.nav-group-title { font-weight: 700; }

/* Lab pages */
.lab-layout { display: grid; grid-template-columns: 14rem minmax(0, 1fr) 14rem; gap: 2rem; padding-top: 1.75rem; }
.lab-side { font-size: .95rem; }
.side-title { display: inline-block; padding: .2rem .7rem; margin: 0 0 .6rem; font-family: var(--font-hand); font-size: 1.25rem; }
.side-label { margin: .4rem 0 0; font-size: .85rem; color: var(--muted); }
.side-orphan { font-size: .9rem; color: var(--muted); }
.lab-side .nav-list a { color: var(--ink); text-decoration: none; }
.lab-side .nav-list a:hover { text-decoration: underline; }
.lab-side a[aria-current='page'] { font-weight: 700; position: relative; }
.lab-side a[aria-current='page']::after { content: ''; position: absolute; inset: -5px -8px; border: 2px solid var(--loop); border-radius: var(--radius-a); pointer-events: none; }
.side-menu > summary { font-family: var(--font-hand); font-size: 1.2rem; cursor: pointer; }
.lab-main { min-width: 0; }
.lab-head h1 { font-size: clamp(2rem, 4vw, 2.6rem); margin: 0 0 .3rem; }
.lab-meta { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; font-size: .9rem; color: var(--muted); margin-bottom: 1.25rem; }
.prose { max-width: 70ch; }
.prose h2 { font-size: 1.7rem; margin: 2rem 0 .6rem; }
.prose h3 { font-size: 1.35rem; margin: 1.6rem 0 .5rem; }
.prose img { max-width: 100%; height: auto; border: 2px solid var(--rule); border-radius: 4px; display: block; }
.prose table { border-collapse: collapse; display: block; overflow-x: auto; font-size: .92rem; }
.prose th, .prose td { border: 1.5px solid var(--rule); padding: .35rem .6rem; text-align: left; vertical-align: top; }
.prose :not(pre) > code { font-family: var(--font-mono); font-size: .88em; background: var(--start-fill); padding: .05rem .3rem; border-radius: 3px; }
.prose blockquote { margin: 1rem 0; padding: .2rem 1rem; border-left: 3px solid var(--rule); }
.prev-next { display: flex; justify-content: space-between; gap: 1rem; margin-top: 2.5rem; }
.prev-next a { font-family: var(--font-hand); font-size: 1.15rem; color: var(--ink); text-decoration: none; padding: .4rem 1rem; }
.prev-next a:hover { background: var(--start-fill); }
.coming-soon { padding: 1.2rem 1.4rem; border-style: dashed; }
.coming-soon-title { font-family: var(--font-hand); font-size: 1.6rem; margin: 0 0 .3rem; }
.not-found { padding: 3rem 0; max-width: 40rem; }

/* Code */
figure.code { position: relative; margin: 1rem 0 1.25rem; }
figure.code pre { margin: 0; background: var(--code-bg); color: var(--code-ink); font-family: var(--font-mono); font-size: .84rem; line-height: 1.65; padding: 1rem 1.1rem; border-radius: 6px; overflow-x: auto; }
.code-title { font-family: var(--font-mono); font-size: .82rem; margin-bottom: .3rem; color: var(--muted); }
.copy-btn { position: absolute; top: .5rem; right: .5rem; font-family: var(--font-hand); font-size: .95rem; background: var(--paper); color: var(--ink); border-color: var(--paper); padding: 0 .7rem; cursor: pointer; z-index: 1; }
figure.code:has(.code-title) .copy-btn { top: 2rem; }
.copy-btn.is-done { animation: wiggle .3s ease-out; }
@keyframes wiggle { 0% { transform: rotate(0); } 40% { transform: rotate(-4deg); } 100% { transform: rotate(0); } }
.var { color: var(--var-empty); border-bottom: 1.5px dashed var(--var-empty); }
.var.is-set { color: var(--var-set); border-bottom-color: var(--var-set); }

/* "Your values" sticky note */
.lab-aside { min-width: 0; }
.sticky-note { position: sticky; top: 1rem; background: var(--sticky); color: var(--sticky-ink); padding: 1rem 1rem 1.1rem; transform: rotate(-1.2deg); box-shadow: 2px 3px 0 rgb(0 0 0 / 0.15); font-size: .88rem; }
.sticky-note h2 { margin: 0 0 .4rem; font-size: 1.4rem; }
.sticky-note p { margin: 0; }
.sticky-note label { display: block; font-family: var(--font-mono); font-size: .78rem; margin-top: .7rem; word-break: break-all; }
.sticky-note input { width: 100%; font-family: var(--font-mono); font-size: .82rem; border: 0; border-bottom: 2px solid currentColor; background: transparent; color: inherit; padding: .2rem 0; }
.sticky-note .var-secret { margin: .2rem 0 0; font-size: .8rem; font-style: italic; }
.sticky-note .var-hint { margin-top: .8rem; font-size: .8rem; }
.sticky-note a { color: inherit; }

@media (max-width: 1000px) {
  .hero { grid-template-columns: 1fr; }
  .flow { grid-template-columns: 1fr; }
  .flow-arrow { transform: rotate(90deg); width: 3.5rem; margin: 0 auto; }
  .tracks { grid-template-columns: 1fr; }
  .track.is-big { grid-row: auto; }
  .workstation .nav-list { columns: 1; }
  .lab-layout { grid-template-columns: minmax(0, 1fr); gap: 1rem; }
  .sticky-note { position: static; transform: none; margin: 1rem 0; }
  .search { flex: 1 1 100%; order: 5; }
  .search input { width: 100%; }
}
@media (min-width: 1001px) {
  .side-menu > summary { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 4: Base layout, search markup, theme toggle, favicon**

`site/src/components/Search.astro`:

```astro
<div class="search" data-search role="search">
  <label class="visually-hidden" for="site-search">Search labs</label>
  <input id="site-search" class="sk" type="search" placeholder="Search labs… ( / )" autocomplete="off" data-search-input />
  <ul class="search-results sk-alt" data-search-results hidden></ul>
</div>
```

`site/src/scripts/theme-toggle.ts`:

```ts
const KEY = 'afg:theme';

export function effectiveTheme(): 'light' | 'dark' {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function initThemeToggle(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  if (!button) return;
  const render = () => {
    const theme = effectiveTheme();
    button.textContent = theme === 'dark' ? 'light' : 'dark';
    button.setAttribute('aria-pressed', String(theme === 'dark'));
  };
  const announce = () => document.dispatchEvent(new CustomEvent('afg:themechange'));
  button.addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the theme lasts for this page only.
    }
    render();
    announce();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    render();
    announce();
  });
  render();
}
```

`site/src/scripts/main.ts` (Task 11 replaces this with the full list):

```ts
import { initThemeToggle } from './theme-toggle';

initThemeToggle();
```

`site/public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M5 7 C11 5, 22 6, 27 6 C28 12, 27 20, 26 26 C19 27, 11 26, 6 27 C5 20, 4 13, 5 7 Z" fill="#a5d8ff" stroke="#1e1e1e" stroke-width="2.2" stroke-linejoin="round"/></svg>
```

`site/src/layouts/Base.astro`:

```astro
---
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/atkinson-hyperlegible/400-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '../styles/global.css';
import Search from '../components/Search.astro';
import { THEME_SCRIPT } from '../lib/theme-script.mjs';
import { SITE_DESCRIPTION, SITE_NAME } from '../lib/site';
import { REPO_URL } from '../lib/routes';
import { firstLabRoute } from '../lib/readme-nav';
import { loadSiteNav } from '../lib/repo';

interface Props {
  title?: string;
  description?: string;
}
const { title, description = SITE_DESCRIPTION } = Astro.props;
const nav = loadSiteNav();
const prereqItem = nav.startHere.items.find((i) => i.type === 'lab');
const prereqHref = prereqItem && prereqItem.type === 'lab' ? prereqItem.route : null;
const workstation = nav.sections.find((s) => /workstation/i.test(s.title));
const workstationHref = workstation ? firstLabRoute(workstation) : null;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title ? `${title} | ${SITE_NAME}` : SITE_NAME}</title>
    <meta name="description" content={description} />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <script is:inline set:html={THEME_SCRIPT}></script>
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <a class="wordmark" href="/">{SITE_NAME}</a>
      <nav class="site-nav" aria-label="Site">
        <a href="/#scenarios">Scenarios</a>
        {prereqHref && <a href={prereqHref}>Prerequisites</a>}
        {workstationHref && <a href={workstationHref}>Workstation</a>}
        <a href={REPO_URL}>GitHub</a>
      </nav>
      <Search />
      <button type="button" class="theme-toggle sk" data-theme-toggle aria-label="Dark mode">dark</button>
    </header>
    <main id="main"><slot /></main>
    <footer class="site-footer">
      <span>Content from <a href={REPO_URL}>Agentic-AI-The-Hard-Way</a> on GitHub.</span>
      <span>Fonts: Excalifont, Atkinson Hyperlegible, IBM Plex Mono (<a href="/fonts/excalifont/OFL.txt">SIL OFL 1.1</a>).</span>
    </footer>
    <script>
      import '../scripts/main.ts';
    </script>
  </body>
</html>
```

`site/src/pages/index.astro` (temporary, replaced in Task 10):

```astro
---
import Base from '../layouts/Base.astro';
---
<Base><h1>Agentic Field Guide</h1></Base>
```

- [ ] **Step 5: Verify**

Run: `npm run build && npm run check && grep -o '<script[^>]*>' dist/index.html`
Expected:
- The build passes and `astro check` reports 0 errors.
- `grep` prints exactly 2 tags: one bare `<script>` (the inline theme script) and one `<script type="module" src="/_astro/...js">`.
- No other inline scripts.

Then run `npm run preview` and open `http://localhost:4321/`. Expect:
- The Excalifont wordmark and the header links.
- The theme toggle switches dark/light and the choice survives a reload.
- No requests to `fonts.googleapis.com` (check DevTools Network).

- [ ] **Step 6: Commit**

```bash
git add site/public site/src/lib/site.ts site/src/lib/theme-script.mjs site/src/lib/theme-script.d.mts site/src/styles site/src/layouts/Base.astro site/src/components/Search.astro site/src/scripts site/src/pages/index.astro
git commit -m "Add fonts, Whiteboard styles, theme script and base layout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Lab, folder, coming-soon and 404 pages

**Files:**
- Create: `site/src/content.config.ts`, `site/src/components/NavList.astro`, `site/src/components/ComingSoon.astro`, `site/src/layouts/LabLayout.astro`, `site/src/pages/[...slug].astro`, `site/src/pages/404.astro`

**Interfaces:**
- Consumes: Tasks 3–8 (`repoPathToRoute`, `githubUrl`, `findGroupForRoute`, `flattenLabs`, `loadSiteNav`, `folderDirs`, `folderFiles`, `REPO_ROOT`, `renderCodeBlock`, `pageTitle`, `Base`).
- Produces:
  - Collection `pages`, with ids like `platform-engineering-assistant/deploy-kagent` (path without `.md`).
  - `NavList.astro` with props `{ items: NavItem[]; current?: string; ordered?: boolean; compact?: boolean }`.
  - `LabLayout.astro` with props `{ title; route; github; group: NavGroup | null; position: { index: number; total: number } | null; prev: LabItem | null; next: LabItem | null }`.
  - Markup hooks for Task 11: `[data-var-panel]`, `[data-var-list]`, `[data-var-clear]`, `[data-side-menu]`, `.prose`, `.lab-aside`.

- [ ] **Step 1: Content collection**

`site/src/content.config.ts`:

```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

export const collections = {
  pages: defineCollection({
    loader: glob({
      // The repo root is one level up. Dot-directories (.git, .github, .superpowers) are skipped by default.
      pattern: ['**/*.md', '!README.md', '!site/**', '!docs/**', '!**/node_modules/**'],
      base: '..',
      generateId: ({ entry }) => entry.replace(/\.md$/, ''),
    }),
  }),
};
```

- [ ] **Step 2: Components and layout**

`site/src/components/NavList.astro`:

```astro
---
import type { NavItem } from '../lib/readme-nav';

interface Props {
  items: NavItem[];
  current?: string;
  ordered?: boolean;
  compact?: boolean;
}
const { items, current, ordered = false, compact = false } = Astro.props;
const Tag = ordered ? 'ol' : 'ul';
const notesOf = (item: NavItem): string[] => ('notes' in item ? item.notes : []);
---
<Tag class:list={['nav-list', { compact }]}>
  {items.map((item) => (
    <li class={`nav-${item.type}`} title={!compact && notesOf(item).length ? notesOf(item).join(' ') : undefined}>
      {item.type === 'lab' && (
        <a href={item.route} class:list={{ 'is-soon': item.comingSoon }} aria-current={item.route === current ? 'page' : undefined}>
          {item.title}{item.comingSoon && <span class="soon-tag"> (coming soon)</span>}
        </a>
      )}
      {item.type === 'soon' && <span class="is-soon">{item.title} <span class="soon-tag">(coming soon)</span></span>}
      {item.type === 'external' && <a href={item.url} rel="noopener">{item.title} ↗</a>}
      {item.type === 'group' && <span class="nav-group-title">{item.title}</span>}
      {compact && notesOf(item).map((note) => <p class="nav-note">{note}</p>)}
      {item.children.length > 0 && <Astro.self items={item.children} current={current} compact={compact} />}
    </li>
  ))}
</Tag>
```

`site/src/components/ComingSoon.astro`:

```astro
<div class="coming-soon sk-alt">
  <p class="coming-soon-title">Coming soon</p>
  <p>This lab is still being written. Pick another lab from the list, or watch the GitHub repo for updates.</p>
</div>
```

`site/src/layouts/LabLayout.astro`:

```astro
---
import Base from './Base.astro';
import NavList from '../components/NavList.astro';
import type { LabItem, NavGroup } from '../lib/readme-nav';

interface Props {
  title: string;
  route: string;
  github: string;
  group: NavGroup | null;
  position: { index: number; total: number } | null;
  prev: LabItem | null;
  next: LabItem | null;
}
const { title, route, github, group, position, prev, next } = Astro.props;
---
<Base title={title}>
  <div class="lab-layout">
    <nav class="lab-side" aria-label={group ? `${group.title} labs` : 'Labs'}>
      {group ? (
        <details class="side-menu" open data-side-menu>
          <summary>{group.title}</summary>
          <p class:list={['side-title', 'sk', group.color && `fill-${group.color}`]}>{group.title}</p>
          {group.beforeYouStart.length > 0 && (
            <>
              <p class="side-label">Before you start</p>
              <NavList items={group.beforeYouStart} current={route} />
            </>
          )}
          <NavList items={group.items} current={route} ordered />
        </details>
      ) : (
        <p class="side-orphan">This page isn't in the README's lab list yet. <a href="/#scenarios">All scenarios</a></p>
      )}
    </nav>
    <article class="lab-main" data-pagefind-body>
      <header class="lab-head">
        <h1 data-pagefind-meta="title">{title}</h1>
        <div class="lab-meta" data-pagefind-ignore>
          {group && <span>{group.title}{position && ` / lab ${position.index} of ${position.total}`}</span>}
          <a href={github}>View on GitHub</a>
        </div>
      </header>
      <div class="prose"><slot /></div>
      <nav class="prev-next" aria-label="Previous and next lab" data-pagefind-ignore>
        {prev ? <a class="sk" href={prev.route} rel="prev">← {prev.title}</a> : <span></span>}
        {next ? <a class="sk-alt" href={next.route} rel="next">{next.title} →</a> : <span></span>}
      </nav>
    </article>
    <aside class="lab-aside">
      <section class="sticky-note" data-var-panel hidden aria-labelledby="var-title">
        <h2 id="var-title">Your values</h2>
        <p>Filled into every command on the site. Saved in this browser only.</p>
        <div data-var-list></div>
        <p class="var-hint">Leave blank to keep the <code>$VAR</code> as written. <a href="#" data-var-clear>Clear all</a></p>
      </section>
    </aside>
  </div>
</Base>
```

- [ ] **Step 3: Dynamic route and 404**

`site/src/pages/[...slug].astro`:

```astro
---
import { getCollection, render, type CollectionEntry } from 'astro:content';
import LabLayout from '../layouts/LabLayout.astro';
import ComingSoon from '../components/ComingSoon.astro';
import { REPO_ROOT, folderDirs, folderFiles, loadSiteNav } from '../lib/repo';
import { githubUrl, repoPathToRoute } from '../lib/routes';
import { findGroupForRoute, flattenLabs } from '../lib/readme-nav';
import { renderCodeBlock } from '../lib/code-html';
import { pageTitle } from '../lib/titles';

type PageProps = { kind: 'md'; entry: CollectionEntry<'pages'> } | { kind: 'dir'; dir: string };

export async function getStaticPaths() {
  const entries = await getCollection('pages');
  const seen = new Map<string, string>();
  const paths: Array<{ params: { slug: string }; props: PageProps }> = [];
  const add = (route: string, source: string, props: PageProps) => {
    const slug = route.slice(1, -1);
    const clash = seen.get(slug);
    if (clash) throw new Error(`route ${route} is produced by both ${clash} and ${source}`);
    seen.set(slug, source);
    paths.push({ params: { slug }, props });
  };
  for (const entry of entries) add(repoPathToRoute(`${entry.id}.md`, 'file'), `${entry.id}.md`, { kind: 'md', entry });
  for (const dir of folderDirs(REPO_ROOT)) add(repoPathToRoute(dir, 'dir'), `${dir}/`, { kind: 'dir', dir });
  return paths;
}

const props = Astro.props as PageProps;
const kind = props.kind === 'md' ? 'file' : 'dir';
const repoPath = props.kind === 'md' ? `${props.entry.id}.md` : props.dir;
const route = repoPathToRoute(repoPath, kind);
const found = findGroupForRoute(loadSiteNav(), route);
const body = props.kind === 'md' ? props.entry.body ?? '' : '';
const title = pageTitle(found?.item.title ?? null, body, repoPath);
const labs = found ? flattenLabs(found.group) : [];
const index = labs.findIndex((l) => l.route === route);

const isEmpty = props.kind === 'md' && !body.trim();
const Content = props.kind === 'md' && !isEmpty ? (await render(props.entry)).Content : null;
const folder = props.kind === 'dir' ? folderFiles(REPO_ROOT, props.dir) : null;
const folderEntries = folder ? await getCollection('pages', (e) => folder.md.includes(`${e.id}.md`)) : [];
const folderContents = await Promise.all(folderEntries.map(async (e) => (await render(e)).Content));
---
<LabLayout
  title={title}
  route={route}
  github={githubUrl(repoPath, kind)}
  group={found?.group ?? null}
  position={index >= 0 ? { index: index + 1, total: labs.length } : null}
  prev={index > 0 ? labs[index - 1] : null}
  next={index >= 0 && index < labs.length - 1 ? labs[index + 1] : null}
>
  {isEmpty && <ComingSoon />}
  {Content && <Content />}
  {folderContents.map((FolderContent) => <FolderContent />)}
  {folder?.code.map((file) => <Fragment set:html={renderCodeBlock(file.text, file.lang, file.name)} />)}
</LabLayout>
```

`site/src/pages/404.astro`:

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="Page not found">
  <section class="not-found">
    <h1>Page not found</h1>
    <p>That lab may have moved when the README was reorganized.</p>
    <p><a href="/#scenarios">Back to all scenarios</a>, or press <kbd>/</kbd> to search.</p>
  </section>
</Base>
```

- [ ] **Step 4: Build and inspect**

Run:

```bash
npm run build
ls dist/platform-engineering-assistant/deploy-kagent/index.html dist/the-broken-apps/pe-assistant-app/index.html dist/k8s-terraform/aks/index.html dist/the-observer/create-agent/index.html dist/platform-engineering-assistant/vllm-llmd/index.html dist/404.html
grep -o 'href="/k8s-terraform/[^"]*"' dist/k8s-terraform/setup/index.html
grep -c 'data-var="INGRESS_GW_ADDRESS"' dist/platform-engineering-assistant/gateway-creation-update-modelconfig/index.html
grep -o '<img[^>]*>' dist/workstation-setup/terminal/index.html
grep -q 'class="coming-soon-title"' dist/platform-engineering-assistant/vllm-llmd/index.html && echo coming-soon-ok
npm run check
```

Expected:
- All files are listed.
- `setup` links to `/k8s-terraform/aks/` and `/k8s-terraform/eks/`.
- The var count is ≥2.
- The two `<img>` tags have `src="/_astro/...webp"` and the alt text from Task 1.
- `coming-soon-ok` is printed.
- `astro check` reports 0 errors.

- [ ] **Step 5: Verify a missing image fails the build (then revert)**

```bash
printf '# temp\n\n![x](images/does-not-exist.png)\n' > ../zz-missing-image-check.md
npm run build; echo "exit=$?"
rm ../zz-missing-image-check.md
```

Expected: a non-zero `exit`, with an error naming `does-not-exist.png`. Afterwards, `git status` shows no `zz-missing-image-check.md`.

- [ ] **Step 6: Manual browser check**

Run `npm run preview` and open `http://localhost:4321/platform-engineering-assistant/gateway-creation-update-modelconfig/`. Expect:
- The sidebar shows the PE track, with the current lab circled and coming-soon items in italics.
- The screenshots are framed.
- The code blocks are dark, with the vars dashed-underlined.
- The previous/next buttons work.
- At width < 1000px, the sidebar becomes a "Platform Engineering Assistant" disclosure.

- [ ] **Step 7: Commit**

```bash
git add site/src/content.config.ts site/src/components/NavList.astro site/src/components/ComingSoon.astro site/src/layouts/LabLayout.astro site/src/pages/[...slug].astro site/src/pages/404.astro
git commit -m "Render lab, folder, coming-soon and 404 pages from repo markdown

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Home page

**Files:**
- Create: `site/src/components/TrackBox.astro`
- Modify: `site/src/pages/index.astro` (full replacement)

**Interfaces:**
- Consumes: `loadSiteNav`, `countItems`, `firstLabRoute`, `NavList`, `Base`, `HERO_HEADING`, `BANNER_ALT`.
- Produces markup hooks for Task 11:
  - `[data-box-href]` on every track box that has a first lab.
  - `svg[data-rough-arrow]`.
  - `#scenarios`.

- [ ] **Step 1: Track box**

`site/src/components/TrackBox.astro`:

```astro
---
import NavList from './NavList.astro';
import { countItems, firstLabRoute, type NavGroup } from '../lib/readme-nav';

interface Props {
  track: NavGroup;
}
const { track } = Astro.props;
const href = firstLabRoute(track);
const { labs, soon } = countItems(track);
const big = labs + soon >= 6;
const count =
  labs === 0 ? 'Coming soon' : `${labs} ${labs === 1 ? 'lab' : 'labs'}${soon ? `, ${soon} coming soon` : ''}`;
---
<article
  id={track.slug}
  class:list={['track', big ? 'sk' : 'sk-alt', track.color ? `fill-${track.color}` : 'is-empty', { 'is-big': big }]}
  data-box-href={href ?? undefined}
>
  <h3>{href ? <a href={href}>{track.title}</a> : track.title}</h3>
  {track.blurb && <p class="track-blurb">{track.blurb}</p>}
  {track.beforeYouStart.length > 0 && <NavList items={track.beforeYouStart} compact />}
  {track.items.length > 0 && <NavList items={track.items} ordered compact />}
  <p class="track-count">{count}</p>
</article>
```

- [ ] **Step 2: Home page**

`site/src/pages/index.astro`:

```astro
---
import { Image } from 'astro:assets';
import Base from '../layouts/Base.astro';
import NavList from '../components/NavList.astro';
import TrackBox from '../components/TrackBox.astro';
import banner from '../../../images/banner.png';
import { loadSiteNav } from '../lib/repo';
import { BANNER_ALT, HERO_HEADING } from '../lib/site';

const nav = loadSiteNav();
const sections = nav.sections.filter((s) => s.items.length > 0);
---
<Base>
  <section class="hero">
    <div>
      <h1>{HERO_HEADING}</h1>
      <p>{nav.intro}</p>
    </div>
    <Image src={banner} alt={BANNER_ALT} class="hero-banner" widths={[640, 1024]} sizes="(max-width: 1000px) 100vw, 55vw" loading="eager" />
  </section>

  <section class="scenarios" id="scenarios" aria-labelledby="scenarios-title">
    <h2 id="scenarios-title">Pick a scenario</h2>
    <div class="flow">
      <div class="start sk">
        <h3>Start here</h3>
        <NavList items={nav.startHere.items} />
      </div>
      <svg class="flow-arrow" data-rough-arrow viewBox="0 0 60 40" aria-hidden="true" focusable="false">
        <text x="30" y="27" text-anchor="middle">→</text>
      </svg>
      <div class="tracks">
        {nav.tracks.map((track) => <TrackBox track={track} />)}
      </div>
    </div>
  </section>

  {sections.map((section) => (
    <section class="workstation" aria-labelledby={`sec-${section.slug}`}>
      <h2 id={`sec-${section.slug}`}>{section.title}</h2>
      <NavList items={section.items} ordered compact />
    </section>
  ))}
</Base>
```

- [ ] **Step 3: Verify**

Run:

```bash
npm run build && npm run check
grep -o 'class="track ' dist/index.html | wc -l
grep -o 'data-box-href="[^"]*"' dist/index.html
grep -c 'work in progress' dist/index.html
```

Expected:
- One `track` count per README `###` track.
- `data-box-href` values: `/the-broken-apps/pe-assistant-app/` first, and `/isolated-agent/learn-substrate/` for Isolated Agents.
- The `work in progress` count is `0`.

Then run `npm run preview` and check `/`:
- The hero shows text on the left and the banner on the right.
- Tracks are colored blue/violet/green/peach in README order.
- "Isolated Environments" is dashed.
- PE spans two rows.

- [ ] **Step 4: Commit**

```bash
git add site/src/components/TrackBox.astro site/src/pages/index.astro
git commit -m "Build the home page from README scenarios and labs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Client interactivity (copy, fill-in, images, menu, arrow, search)

**Files:**
- Create: `site/src/scripts/copy.ts`, `site/src/scripts/var-store.ts`, `site/src/scripts/var-panel.ts`, `site/src/scripts/image-links.ts`, `site/src/scripts/side-menu.ts`, `site/src/scripts/track-map.ts`, `site/src/scripts/search.ts`
- Modify: `site/src/scripts/main.ts` (full file below)

**Interfaces:**
- Consumes:
  - `isSecret` and `displayValue` (Task 4).
  - Markup hooks from Tasks 8–10: `.var[data-var][data-raw]`, `figure.code`, `[data-var-panel]`, `[data-var-list]`, `[data-var-clear]`, `.lab-aside`, `[data-side-menu]`, `[data-box-href]`, `svg[data-rough-arrow]`, `[data-search]`, `[data-search-input]`, `[data-search-results]`.
- Produces:
  - From `var-store.ts`:
    - `loadValues(): Record<string, string>`
    - `saveValue(name: string, value: string): Record<string, string>`
    - `clearValues(): Record<string, string>`
  - Input ids `var-<NAME>`, used by Task 13.

- [ ] **Step 1: Write the modules**

`site/src/scripts/var-store.ts`:

```ts
import { isSecret } from '../lib/vars';

const KEY = 'afg:vars';
let memory: Record<string, string> = {};

function read(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return { ...memory };
  }
}

function write(values: Record<string, string>): void {
  memory = { ...values };
  try {
    localStorage.setItem(KEY, JSON.stringify(values));
  } catch {
    // Storage blocked: values live in memory for this page session.
  }
}

/** Saved values, minus anything that looks like a secret (even if an older build or a user stored one). */
export function loadValues(): Record<string, string> {
  const values = read();
  for (const name of Object.keys(values)) {
    if (isSecret(name) || typeof values[name] !== 'string') delete values[name];
  }
  memory = { ...values };
  return values;
}

export function saveValue(name: string, value: string): Record<string, string> {
  const values = loadValues();
  if (isSecret(name)) return values;
  if (value.trim()) values[name] = value;
  else delete values[name];
  write(values);
  return values;
}

export function clearValues(): Record<string, string> {
  write({});
  return {};
}
```

`site/src/scripts/var-panel.ts`:

```ts
import { displayValue, isSecret } from '../lib/vars';
import { clearValues, loadValues, saveValue } from './var-store';

export function initVarPanel(): void {
  const panel = document.querySelector<HTMLElement>('[data-var-panel]');
  const list = panel?.querySelector<HTMLElement>('[data-var-list]');
  const spans = [...document.querySelectorAll<HTMLElement>('.var[data-var]')];
  if (!panel || !list || spans.length === 0) return;

  let values = loadValues();
  const apply = () => {
    for (const span of spans) {
      const raw = span.dataset.raw ?? '';
      const shown = displayValue(span.dataset.var ?? '', raw, values);
      span.textContent = shown; // textContent, never innerHTML: pasted values stay literal text
      span.classList.toggle('is-set', shown !== raw);
    }
  };

  for (const name of [...new Set(spans.map((s) => s.dataset.var ?? ''))]) {
    const row = document.createElement('div');
    row.className = 'var-row';
    const label = document.createElement('label');
    label.textContent = name;
    if (isSecret(name)) {
      const note = document.createElement('p');
      note.className = 'var-secret';
      note.textContent = 'Set this in your shell. Never stored here.';
      row.append(label, note);
    } else {
      const input = document.createElement('input');
      input.id = `var-${name}`;
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.value = values[name] ?? '';
      label.htmlFor = input.id;
      input.addEventListener('input', () => {
        values = saveValue(name, input.value);
        apply();
      });
      row.append(label, input);
    }
    list.append(row);
  }

  panel.querySelector('[data-var-clear]')?.addEventListener('click', (event) => {
    event.preventDefault();
    values = clearValues();
    list.querySelectorAll('input').forEach((input) => (input.value = ''));
    apply();
  });

  // On narrow screens, put the note just above the first code block instead of after the article.
  const firstCode = document.querySelector('.prose figure.code');
  if (firstCode && matchMedia('(max-width: 1000px)').matches) {
    firstCode.before(panel);
    const aside = document.querySelector<HTMLElement>('.lab-aside');
    if (aside) aside.hidden = true;
  }
  panel.hidden = false;
  apply();
}
```

`site/src/scripts/copy.ts`:

```ts
export function initCopyButtons(): void {
  for (const figure of document.querySelectorAll<HTMLElement>('figure.code')) {
    const code = figure.querySelector('code');
    if (!code) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-btn sk';
    button.textContent = 'copy';
    button.setAttribute('aria-label', 'Copy code');
    button.addEventListener('click', async () => {
      try {
        // textContent includes the reader's filled-in values; secrets and blanks stay as $VAR.
        await navigator.clipboard.writeText(code.textContent ?? '');
        button.textContent = 'copied';
        button.classList.add('is-done');
      } catch {
        button.textContent = 'select and copy';
      }
      window.setTimeout(() => {
        button.textContent = 'copy';
        button.classList.remove('is-done');
      }, 1500);
    });
    figure.prepend(button);
  }
}
```

`site/src/scripts/image-links.ts`:

```ts
/** Make each screenshot open at full size. */
export function initImageLinks(): void {
  for (const img of document.querySelectorAll<HTMLImageElement>('.prose img')) {
    if (img.closest('a')) continue;
    const link = document.createElement('a');
    link.href = img.currentSrc || img.src;
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', `${img.alt || 'Screenshot'} (open full size)`);
    img.replaceWith(link);
    link.append(img);
  }
}
```

`site/src/scripts/side-menu.ts`:

```ts
/** The lab list is a disclosure on narrow screens and always open on wide ones. */
export function initSideMenu(): void {
  const menu = document.querySelector<HTMLDetailsElement>('[data-side-menu]');
  if (!menu) return;
  const narrow = matchMedia('(max-width: 1000px)');
  const sync = () => {
    menu.open = !narrow.matches;
  };
  narrow.addEventListener('change', sync);
  sync();
}
```

`site/src/scripts/track-map.ts`:

```ts
import rough from 'roughjs';

export function initTrackMap(): void {
  for (const box of document.querySelectorAll<HTMLElement>('[data-box-href]')) {
    box.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('a')) return;
      window.location.href = box.dataset.boxHref ?? '/';
    });
  }

  const svg = document.querySelector<SVGSVGElement>('svg[data-rough-arrow]');
  if (!svg) return;
  const draw = () => {
    const stroke = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#1e1e1e';
    const rc = rough.svg(svg);
    const options = { stroke, strokeWidth: 2, roughness: 1.4, seed: 7 };
    svg.replaceChildren(rc.line(4, 20, 54, 20, options), rc.line(54, 20, 44, 11, options), rc.line(54, 20, 44, 29, options));
  };
  draw();
  document.addEventListener('afg:themechange', draw);
}
```

`site/src/scripts/search.ts`:

```ts
interface PagefindResultData {
  url: string;
  excerpt: string;
  meta: { title?: string };
}
interface Pagefind {
  search(term: string): Promise<{ results: Array<{ data(): Promise<PagefindResultData> }> }>;
}

let pagefind: Promise<Pagefind> | null = null;
function loadPagefind(): Promise<Pagefind> {
  const url = '/pagefind/pagefind.js';
  pagefind ??= import(/* @vite-ignore */ url) as Promise<Pagefind>;
  return pagefind;
}

/** Pagefind excerpts are HTML with <mark>; copy only text and <mark>, never raw HTML. */
function appendExcerpt(target: HTMLElement, excerpt: string): void {
  const parsed = new DOMParser().parseFromString(`<p>${excerpt}</p>`, 'text/html').body.firstElementChild;
  for (const node of parsed?.childNodes ?? []) {
    if (node.nodeName === 'MARK') {
      const mark = document.createElement('mark');
      mark.textContent = node.textContent;
      target.append(mark);
    } else {
      target.append(document.createTextNode(node.textContent ?? ''));
    }
  }
}

export function initSearch(): void {
  const root = document.querySelector<HTMLElement>('[data-search]');
  const input = root?.querySelector<HTMLInputElement>('[data-search-input]');
  const list = root?.querySelector<HTMLUListElement>('[data-search-results]');
  if (!root || !input || !list) return;

  let timer: number | undefined;
  let sequence = 0;
  const show = (items: HTMLElement[]) => {
    list.replaceChildren(...items);
    list.hidden = items.length === 0;
  };
  const message = (text: string) => {
    const li = document.createElement('li');
    li.className = 'search-msg';
    li.textContent = text;
    show([li]);
  };

  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    const term = input.value.trim();
    if (!term) {
      show([]);
      return;
    }
    timer = window.setTimeout(async () => {
      const mine = ++sequence;
      if (import.meta.env.DEV) {
        message('Search works after a build: npm run build && npm run preview');
        return;
      }
      try {
        const results = await (await loadPagefind()).search(term);
        const data = await Promise.all(results.results.slice(0, 8).map((r) => r.data()));
        if (mine !== sequence) return;
        if (data.length === 0) {
          message(`No labs match "${term}".`);
          return;
        }
        show(
          data.map((d) => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = d.url;
            const title = document.createElement('strong');
            title.textContent = d.meta.title ?? d.url;
            const excerpt = document.createElement('span');
            excerpt.className = 'search-excerpt';
            appendExcerpt(excerpt, d.excerpt);
            a.append(title, excerpt);
            li.append(a);
            return li;
          }),
        );
      } catch {
        if (mine === sequence) message('Search is unavailable right now.');
      }
    }, 150);
  });

  document.addEventListener('keydown', (event) => {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (event.key === '/' && !typing) {
      event.preventDefault();
      input.focus();
    }
    if (event.key === 'Escape' && document.activeElement === input) {
      show([]);
      input.blur();
    }
  });
}
```

`site/src/scripts/main.ts`:

```ts
import { initThemeToggle } from './theme-toggle';
import { initVarPanel } from './var-panel';
import { initCopyButtons } from './copy';
import { initImageLinks } from './image-links';
import { initSideMenu } from './side-menu';
import { initTrackMap } from './track-map';
import { initSearch } from './search';

initThemeToggle();
initVarPanel();
initCopyButtons();
initImageLinks();
initSideMenu();
initTrackMap();
initSearch();
```

- [ ] **Step 2: Verify**

Run `npm run build && npm run check`. Expected: 0 errors.

Then run `npm run preview` and check by hand. Task 13 automates all of this:
1. Open the gateway lab. The "Your values" note lists `INGRESS_GW_ADDRESS`, plus `ANTHROPIC_API_KEY` marked "Set this in your shell".
2. Type `20.84.113.7`. Every `$INGRESS_GW_ADDRESS` turns green and shows the value.
3. Click copy on the curl block and paste. The text contains `20.84.113.7:8080/ollama`.
4. Open `/platform-engineering-assistant/prompt-guard/`. The value is already filled in.
5. On `/`, the Rough.js arrow is drawn. Clicking a track box's empty area opens its first lab, and clicking a lab name opens that lab.
6. Search shows the dev message only under `npm run dev`. Under preview, Pagefind is not built yet; that happens in Task 12.

- [ ] **Step 3: Commit**

```bash
git add site/src/scripts
git commit -m "Add copy buttons, variable fill-in, image links, menu, arrow and search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Post-build steps (Pagefind, SWA config with CSP, link check)

**Files:**
- Create: `site/scripts/write-swa-config.mjs`, `site/scripts/write-swa-config.d.mts`, `site/scripts/check-links.mjs`
- Modify: `site/package.json` (`scripts` block, full content below)
- Test: `site/tests/unit/swa-config.test.ts`

**Interfaces:**
- Consumes: `THEME_SCRIPT` (Task 8).
- Produces:
  - `dist/staticwebapp.config.json`.
  - `buildSwaConfig(themeScript: string): object` and `cspFor(themeScript: string): string`, exported for the unit test and for Task 13's CSP route.
  - `npm run build`, which runs build, then pagefind, then the config writer, then the link check.

**Note (deviation from spec section 11):** `script-src` adds `'wasm-unsafe-eval'`, because Pagefind runs its search index as WebAssembly. Without it, search fails under the CSP.

- [ ] **Step 1: Write the failing test**

`site/tests/unit/swa-config.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildSwaConfig, cspFor } from '../../scripts/write-swa-config.mjs';
import { THEME_SCRIPT } from '../../src/lib/theme-script.mjs';

describe('SWA config', () => {
  it('allows the theme script by hash and nothing inline', () => {
    const hash = createHash('sha256').update(THEME_SCRIPT).digest('base64');
    const csp = cspFor(THEME_SCRIPT);
    expect(csp).toContain(`script-src 'self' 'sha256-${hash}' 'wasm-unsafe-eval'`);
    expect(csp).toContain("style-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).toContain("frame-ancestors 'none'");
  });
  it('sets security headers, 404 rewrite and Pagefind MIME types', () => {
    const config = buildSwaConfig(THEME_SCRIPT);
    expect(config.globalHeaders['X-Content-Type-Options']).toBe('nosniff');
    expect(config.globalHeaders['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(config.responseOverrides['404'].rewrite).toBe('/404.html');
    expect(config.mimeTypes['.pf_fragment']).toBe('application/octet-stream');
    expect(config.mimeTypes['.wasm']).toBe('application/wasm');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/swa-config.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`site/scripts/write-swa-config.mjs`:

```js
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME_SCRIPT } from '../src/lib/theme-script.mjs';

export function cspFor(themeScript) {
  const hash = createHash('sha256').update(themeScript).digest('base64');
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval': Pagefind runs its search index as WebAssembly.
    `script-src 'self' 'sha256-${hash}' 'wasm-unsafe-eval'`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function buildSwaConfig(themeScript) {
  return {
    responseOverrides: { 404: { rewrite: '/404.html' } },
    globalHeaders: {
      'Content-Security-Policy': cspFor(themeScript),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
    mimeTypes: {
      '.pagefind': 'application/octet-stream',
      '.pf_meta': 'application/octet-stream',
      '.pf_index': 'application/octet-stream',
      '.pf_fragment': 'application/octet-stream',
      '.wasm': 'application/wasm',
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = path.resolve('dist', 'staticwebapp.config.json');
  fs.writeFileSync(out, `${JSON.stringify(buildSwaConfig(THEME_SCRIPT), null, 2)}\n`);
  console.log(`wrote ${out}`);
}
```

`site/scripts/write-swa-config.d.mts` (so `astro check` can type the imports in tests):

```ts
export interface SwaConfig {
  responseOverrides: Record<string, { rewrite: string }>;
  globalHeaders: Record<string, string>;
  mimeTypes: Record<string, string>;
}
export declare function cspFor(themeScript: string): string;
export declare function buildSwaConfig(themeScript: string): SwaConfig;
```

`site/scripts/check-links.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
const ATTR_RE = /\b(?:href|src)="(\/[^"#?]*)/g;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(abs) : [abs];
  });
}

function resolves(url) {
  const target = path.join(DIST, decodeURI(url));
  if (url.endsWith('/')) return fs.existsSync(path.join(target, 'index.html'));
  return fs.existsSync(target) || fs.existsSync(path.join(target, 'index.html'));
}

const broken = [];
for (const file of walk(DIST).filter((f) => f.endsWith('.html'))) {
  const html = fs.readFileSync(file, 'utf8');
  for (const match of html.matchAll(ATTR_RE)) {
    const url = match[1];
    if (url.startsWith('//')) continue;
    if (!resolves(url)) broken.push(`${path.relative(DIST, file)} -> ${url}`);
  }
}

if (broken.length > 0) {
  console.error(`Broken internal links (${broken.length}):\n${broken.join('\n')}`);
  process.exit(1);
}
console.log('internal links OK');
```

`site/package.json` `scripts` block (replace the whole block):

```json
  "scripts": {
    "dev": "astro dev",
    "build": "astro build && pagefind --site dist && node scripts/write-swa-config.mjs && node scripts/check-links.mjs",
    "preview": "astro preview --port 4321",
    "check": "astro check",
    "test": "vitest run",
    "test:e2e": "playwright test"
  }
```

- [ ] **Step 4: Run tests and the full build**

Run: `npx vitest run tests/unit/swa-config.test.ts && npm run check && npm run build`
Expected:
- The tests PASS.
- The build log shows Pagefind indexing pages, `wrote .../dist/staticwebapp.config.json`, and `internal links OK`.
- `ls dist/pagefind/pagefind.js` exists.

- [ ] **Step 5: Prove the link check catches breakage (then revert)**

```bash
mkdir -p dist/zz && printf '<a href="/nope/">x</a>' > dist/zz/index.html
node scripts/check-links.mjs; echo "exit=$?"
rm -rf dist/zz
```

Expected: `Broken internal links (1): zz/index.html -> /nope/` and `exit=1`.

- [ ] **Step 6: Commit**

```bash
git add site/scripts site/package.json site/tests/unit/swa-config.test.ts
git commit -m "Add Pagefind, SWA config with CSP hash, and internal link check to the build

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Browser tests (Playwright)

**Files:**
- Create: `site/playwright.config.ts`, `site/tests/e2e/helpers.ts`, `site/tests/e2e/home.spec.ts`, `site/tests/e2e/vars.spec.ts`, `site/tests/e2e/security.spec.ts`, `site/tests/e2e/search-theme.spec.ts`

**Interfaces:**
- Consumes:
  - The built `dist/`, served by `npm run preview` on port 4321.
  - `loadSiteNav` and `firstLabRoute` (for the home assertions).
  - `buildSwaConfig` (to apply the real CSP in tests).
- Produces: `npx playwright test`, which runs in CI (Task 15).

- [ ] **Step 1: Config and helpers**

`site/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4321',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], permissions: ['clipboard-read', 'clipboard-write'] } }],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
  },
});
```

`site/tests/e2e/helpers.ts`:

```ts
import type { Page } from '@playwright/test';
import { cspFor } from '../../scripts/write-swa-config.mjs';
import { THEME_SCRIPT } from '../../src/lib/theme-script.mjs';

export const GATEWAY_LAB = '/platform-engineering-assistant/gateway-creation-update-modelconfig/';
export const PROMPT_GUARD = '/platform-engineering-assistant/prompt-guard/';

/** `astro preview` doesn't send SWA headers, so add the production CSP to every HTML response. */
export async function withProductionCsp(page: Page): Promise<string[]> {
  const csp = cspFor(THEME_SCRIPT);
  await page.route('**/*', async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    if ((headers['content-type'] ?? '').includes('text/html')) headers['content-security-policy'] = csp;
    await route.fulfill({ response, headers });
  });
  const violations: string[] = [];
  await page.exposeFunction('__reportCsp', (v: string) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { __reportCsp: (v: string) => void }).__reportCsp(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  return violations;
}

export async function copyFrom(page: Page, blockText: string): Promise<string> {
  const figure = page.locator('figure.code', { hasText: blockText }).first();
  await figure.locator('.copy-btn').click();
  return page.evaluate(() => navigator.clipboard.readText());
}
```

- [ ] **Step 2: Write the specs**

`site/tests/e2e/home.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { loadSiteNav } from '../../src/lib/repo';
import { firstLabRoute } from '../../src/lib/readme-nav';

const nav = loadSiteNav();

test('home renders every README track', async ({ page }) => {
  await page.goto('/');
  for (const track of nav.tracks) {
    await expect(page.locator(`#${track.slug} h3`)).toHaveText(track.title);
  }
  await expect(page.getByText('work in progress', { exact: false })).toHaveCount(0);
});

test('a lab link inside a box opens that lab; the box itself opens the first lab', async ({ page }) => {
  const track = nav.tracks.find((t) => firstLabRoute(t))!;
  await page.goto('/');
  const link = page.locator(`#${track.slug} .nav-list a`).nth(1);
  const href = await link.getAttribute('href');
  await link.click();
  await expect(page).toHaveURL(href!);
  await page.goto('/');
  await page.locator(`#${track.slug} .track-count`).click();
  await expect(page).toHaveURL(firstLabRoute(track)!);
});
```

`site/tests/e2e/vars.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { copyFrom, GATEWAY_LAB, PROMPT_GUARD } from './helpers';

test('fills every occurrence, copies the filled text, and carries to the next page', async ({ page }) => {
  await page.goto(GATEWAY_LAB);
  await page.locator('#var-INGRESS_GW_ADDRESS').fill('20.84.113.7');
  const spans = page.locator('.var[data-var="INGRESS_GW_ADDRESS"]');
  const count = await spans.count();
  expect(count).toBeGreaterThan(1);
  for (let i = 0; i < count; i++) await expect(spans.nth(i)).toHaveText('20.84.113.7');
  expect(await copyFrom(page, ':8080/ollama')).toContain('curl "20.84.113.7:8080/ollama"');
  expect(await copyFrom(page, 'export INGRESS_GW_ADDRESS=')).toContain('export INGRESS_GW_ADDRESS=$(kubectl');

  await page.goto(PROMPT_GUARD);
  await expect(page.locator('.var[data-var="INGRESS_GW_ADDRESS"]').first()).toHaveText('20.84.113.7');
});

test('value with HTML is inserted as text', async ({ page }) => {
  await page.goto(GATEWAY_LAB);
  const payload = '<img src=x onerror="window.__xss=1">';
  await page.locator('#var-INGRESS_GW_ADDRESS').fill(payload);
  await expect(page.locator('.var[data-var="INGRESS_GW_ADDRESS"]').first()).toHaveText(payload);
  await expect(page.locator('figure.code img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
});

test('works when storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  await page.goto(GATEWAY_LAB);
  await page.locator('#var-INGRESS_GW_ADDRESS').fill('10.0.0.5');
  await expect(page.locator('.var[data-var="INGRESS_GW_ADDRESS"]').first()).toHaveText('10.0.0.5');
  await page.locator('[data-theme-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', /dark|light/);
});

test('without JavaScript the page still shows content and raw variables', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(GATEWAY_LAB);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.var[data-var="INGRESS_GW_ADDRESS"]').first()).toHaveText('$INGRESS_GW_ADDRESS');
  await expect(page.locator('[data-var-panel]')).toBeHidden();
  await expect(page.locator('.lab-side a[aria-current="page"]')).toBeVisible();
  await context.close();
});
```

`site/tests/e2e/security.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { copyFrom, GATEWAY_LAB, withProductionCsp } from './helpers';

test('secrets get no input, are never stored, and stay as $VAR when copied', async ({ page }) => {
  await page.goto(GATEWAY_LAB);
  await expect(page.locator('#var-ANTHROPIC_API_KEY')).toHaveCount(0);
  await expect(page.locator('[data-var-panel]')).toContainText('Set this in your shell');
  await page.locator('#var-INGRESS_GW_ADDRESS').fill('1.2.3.4');
  const stored = await page.evaluate(() => localStorage.getItem('afg:vars') ?? '');
  expect(stored).not.toContain('ANTHROPIC');
  expect(await copyFrom(page, 'anthropic-secret')).toContain('$ANTHROPIC_API_KEY');
});

test('stored secret is ignored', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('afg:vars', JSON.stringify({ ANTHROPIC_API_KEY: 'sk-should-not-show' })));
  await page.goto(GATEWAY_LAB);
  await expect(page.getByText('sk-should-not-show')).toHaveCount(0);
  await expect(page.locator('.var[data-var="ANTHROPIC_API_KEY"]').first()).toHaveText('$ANTHROPIC_API_KEY');
});

test('no CSP violations on home, a lab page and a search', async ({ page }) => {
  const violations = await withProductionCsp(page);
  await page.goto('/');
  await page.goto(GATEWAY_LAB);
  await page.locator('#site-search').fill('substrate');
  await expect(page.locator('[data-search-results] a').first()).toBeVisible();
  expect(violations).toEqual([]);
});
```

`site/tests/e2e/search-theme.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('search finds the Substrate install lab', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('/');
  await expect(page.locator('#site-search')).toBeFocused();
  await page.keyboard.type('substrate');
  await expect(page.locator('[data-search-results] a[href="/isolated-agent/installation/"]')).toBeVisible();
});

test('theme choice persists across reloads', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-theme-toggle]').click();
  const theme = await page.locator('html').getAttribute('data-theme');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme!);
});
```

- [ ] **Step 3: Install the browser and run**

```bash
npx playwright install chromium
npm run build && npx playwright test
```

Expected: all tests pass. If `no CSP violations` fails on a `style-src` violation from an inline `style` attribute, find the element with `grep -rn 'style=' dist --include=*.html | head`:
- If it comes from our own markup, remove it.
- If it comes from Rough.js or Astro, add `'unsafe-inline'` to `style-src` in `cspFor`, update the unit test's `not.toContain('unsafe-inline')` to allow it for styles only, and record the reason in the PR description (spec section 11).

- [ ] **Step 4: Commit**

```bash
git add site/playwright.config.ts site/tests/e2e
git commit -m "Add Playwright tests for navigation, fill-in, secrets, CSP, search and theme

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Azure infrastructure (Terraform) and Makefile

**Files:**
- Create: `site/infra/versions.tf`, `site/infra/variables.tf`, `site/infra/main.tf`, `site/infra/outputs.tf`, `site/Makefile`

**Interfaces:**
- Produces:
  - Terraform outputs `name_servers`, `default_host_name`, `api_key` (sensitive).
  - Make targets `install dev build test test-e2e check infra-init infra-plan infra-apply infra-destroy deploy-token clean`.

- [ ] **Step 1: Write Terraform**

`site/infra/versions.tf`:

```hcl
terraform {
  required_version = ">= 1.12"
  required_providers {
    azurerm = {
      source = "hashicorp/azurerm"
      # Exact pin: the repo .gitignore excludes *.lock.hcl, so this is what fixes the provider version.
      version = "5.8.0"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}
```

`site/infra/variables.tf`:

```hcl
variable "subscription_id" {
  type        = string
  description = "Azure subscription ID. Set with TF_VAR_subscription_id; `make infra-plan` reads it from `az account show`."
}

variable "resource_group_name" {
  type    = string
  default = "rg-agentic-field-guide"
}

variable "location" {
  type        = string
  description = "Region for the Static Web App (the Free tier is offered in a limited set of regions)."
  default     = "eastus2"
}

variable "static_web_app_name" {
  type    = string
  default = "agentic-field-guide"
}

variable "domain_name" {
  type    = string
  default = "agenticfieldguide.ai"
}

variable "txt_record_name" {
  type        = string
  description = "Record name for the apex domain-validation TXT value. Microsoft's apex guide uses \"@\"; switch to \"_dnsauth\" if validation stays pending."
  default     = "@"
  validation {
    condition     = contains(["@", "_dnsauth"], var.txt_record_name)
    error_message = "txt_record_name must be \"@\" or \"_dnsauth\"."
  }
}
```

`site/infra/main.tf`:

```hcl
resource "azurerm_resource_group" "site" {
  name     = var.resource_group_name
  location = var.location
}

resource "azurerm_static_web_app" "site" {
  name                = var.static_web_app_name
  resource_group_name = azurerm_resource_group.site.name
  location            = azurerm_resource_group.site.location
  sku_tier            = "Free"
  sku_size            = "Free"

  # Deploying with the API key from GitHub Actions updates these in Azure (per provider docs).
  lifecycle {
    ignore_changes = [repository_url, repository_branch]
  }
}

resource "azurerm_dns_zone" "site" {
  name                = var.domain_name
  resource_group_name = azurerm_resource_group.site.name
}

resource "azurerm_static_web_app_custom_domain" "apex" {
  static_web_app_id = azurerm_static_web_app.site.id
  domain_name       = azurerm_dns_zone.site.name
  # Apex domains must use TXT validation. Terraform doesn't wait for it to finish.
  validation_type = "dns-txt-token"
}

locals {
  validation_at_apex = var.txt_record_name == "@"
}

# Azure DNS keeps every TXT value for a name in one record set, so SPF and (when validating at "@")
# the domain-validation token share this record.
resource "azurerm_dns_txt_record" "apex" {
  name                = "@"
  zone_name           = azurerm_dns_zone.site.name
  resource_group_name = azurerm_resource_group.site.name
  ttl                 = 3600

  # No mail is sent from this domain; carried over from the Squarespace DNS.
  record {
    value = "v=spf1 -all"
  }

  dynamic "record" {
    for_each = local.validation_at_apex ? [azurerm_static_web_app_custom_domain.apex.validation_token] : []
    content {
      value = record.value
    }
  }

  # Azure clears the validation token once the domain validates; ignore it so later plans don't blank the record.
  lifecycle {
    ignore_changes = [record]
  }
}

resource "azurerm_dns_txt_record" "validation" {
  count               = local.validation_at_apex ? 0 : 1
  name                = var.txt_record_name
  zone_name           = azurerm_dns_zone.site.name
  resource_group_name = azurerm_resource_group.site.name
  ttl                 = 3600

  record {
    value = azurerm_static_web_app_custom_domain.apex.validation_token
  }

  lifecycle {
    ignore_changes = [record]
  }
}

# Alias record so the apex keeps Static Web Apps' global distribution.
resource "azurerm_dns_a_record" "apex" {
  name                = "@"
  zone_name           = azurerm_dns_zone.site.name
  resource_group_name = azurerm_resource_group.site.name
  ttl                 = 3600
  target_resource_id  = azurerm_static_web_app.site.id
}
```

`site/infra/outputs.tf`:

```hcl
output "name_servers" {
  description = "Set these four as custom nameservers at the registrar (Squarespace Domains)."
  value       = azurerm_dns_zone.site.name_servers
}

output "default_host_name" {
  value = azurerm_static_web_app.site.default_host_name
}

output "api_key" {
  description = "Deployment token for GitHub Actions. Store with `make deploy-token`; never commit."
  value       = azurerm_static_web_app.site.api_key
  sensitive   = true
}
```

- [ ] **Step 2: Makefile**

`site/Makefile` (recipe lines start with a TAB):

```make
SHELL := /bin/bash
TF := terraform -chdir=infra
REPO := AdminTurnedDevOps/Agentic-AI-The-Hard-Way

.PHONY: install dev build test test-e2e check infra-init infra-plan infra-apply infra-destroy deploy-token clean

install:
	npm ci

dev:
	npm run dev

build:
	npm run build

test:
	npm test

test-e2e: build
	npx playwright test

check:
	npm run check

infra-init:
	$(TF) init

infra-plan: infra-init
	TF_VAR_subscription_id="$$(az account show --query id -o tsv)" $(TF) plan -out=tfplan

infra-apply:
	$(TF) apply tfplan

infra-destroy:
	TF_VAR_subscription_id="$$(az account show --query id -o tsv)" $(TF) destroy

deploy-token:
	$(TF) output -raw api_key | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --repo $(REPO)

clean:
	rm -rf dist .astro node_modules test-results playwright-report
```

- [ ] **Step 3: Validate (no Azure calls)**

Run in `site/`:

```bash
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra init -backend=false
terraform -chdir=infra validate
make -n infra-plan deploy-token
```

Expected:
- `fmt` prints nothing.
- `init` installs `hashicorp/azurerm v5.8.0`.
- `validate` prints `Success! The configuration is valid.`
- `make -n` prints the commands and runs none.

If `validate` rejects an argument, check it against the provider docs at `hashicorp/terraform-provider-azurerm` tag `v5.8.0` (`website/docs/r/`). Do not guess replacements.

- [ ] **Step 4: Commit**

```bash
git add site/infra/versions.tf site/infra/variables.tf site/infra/main.tf site/infra/outputs.tf site/Makefile
git commit -m "Add Terraform for Azure Static Web App, DNS zone and apex domain, plus Makefile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: GitHub Actions

**Files:**
- Create: `.github/workflows/site.yml`, `.github/workflows/site-infra.yml`

**Interfaces:**
- Consumes:
  - `npm test`, `npm run check`, `npm run build`, and `npx playwright test` (Tasks 2–13).
  - The secret `AZURE_STATIC_WEB_APPS_API_TOKEN`, set in Task 17.
- Produces: deployment on pushes to `main` and same-repo PRs, plus preview cleanup.

**Note (deviation from spec section 8):** Terraform checks live in a second workflow, so they run only on `site/infra/**` changes.

Action SHAs were resolved 2026-10-04:

| Action | Version | SHA |
|---|---|---|
| `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | v7.0.0 | `820762786026740c76f36085b0efc47a31fe5020` |
| `actions/upload-artifact` | v7.0.1 | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` |
| `actions/download-artifact` | v8.0.1 | `3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c` |
| `Azure/static-web-apps-deploy` | v1 | commit `4d27395796ac319302594769cfe812bd207490b1` |
| `hashicorp/setup-terraform` | v4.0.1 | `dfe3c3f87815947d99a8997f908cb6525fc44e9e` |

- [ ] **Step 1: Site workflow**

`.github/workflows/site.yml`:

```yaml
name: site

on:
  push:
    branches: [main]
    paths:
      - '**/*.md'
      - 'images/**'
      - '**/images/**'
      - 'the-broken-apps/**'
      - 'the-observer/**'
      - 'k8s-terraform/**'
      - 'site/**'
      - '.github/workflows/site.yml'
  pull_request:
    types: [opened, synchronize, reopened, closed]
    paths:
      - '**/*.md'
      - 'images/**'
      - '**/images/**'
      - 'the-broken-apps/**'
      - 'the-observer/**'
      - 'k8s-terraform/**'
      - 'site/**'
      - '.github/workflows/site.yml'

permissions:
  contents: read

concurrency:
  group: site-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build-test:
    if: github.event_name == 'push' || github.event.action != 'closed'
    runs-on: ubuntu-24.04
    defaults:
      run:
        working-directory: site
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: site/package-lock.json
      - run: npm ci
      - run: npm test
      - run: npm run check
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: site-dist
          path: site/dist
          if-no-files-found: error

  deploy:
    needs: build-test
    # Fork PRs have no access to secrets, so they build and test but don't deploy.
    if: >-
      github.event_name == 'push' ||
      (github.event.action != 'closed' && github.event.pull_request.head.repo.full_name == github.repository)
    runs-on: ubuntu-24.04
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
        with:
          name: site-dist
          path: site/dist
      - uses: Azure/static-web-apps-deploy@4d27395796ac319302594769cfe812bd207490b1 # v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: upload
          app_location: site/dist
          skip_app_build: true
          skip_api_build: true

  close-preview:
    if: >-
      github.event_name == 'pull_request' && github.event.action == 'closed' &&
      github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-24.04
    permissions:
      pull-requests: write
    steps:
      - uses: Azure/static-web-apps-deploy@4d27395796ac319302594769cfe812bd207490b1 # v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          action: close
```

- [ ] **Step 2: Infra workflow**

`.github/workflows/site-infra.yml`:

```yaml
name: site-infra

on:
  push:
    branches: [main]
    paths: ['site/infra/**', '.github/workflows/site-infra.yml']
  pull_request:
    paths: ['site/infra/**', '.github/workflows/site-infra.yml']

permissions:
  contents: read

jobs:
  terraform-check:
    runs-on: ubuntu-24.04
    defaults:
      run:
        working-directory: site/infra
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: hashicorp/setup-terraform@dfe3c3f87815947d99a8997f908cb6525fc44e9e # v4.0.1
        with:
          terraform_version: 1.12.2
      - run: terraform fmt -check -recursive
      - run: terraform init -backend=false
      - run: terraform validate
```

- [ ] **Step 3: Validate the YAML locally**

Run from repo root:

```bash
python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]; print('yaml ok')" .github/workflows/site.yml .github/workflows/site-infra.yml 2>/dev/null \
  || ruby -ryaml -e 'ARGV.each { |f| YAML.load_file(f) }; puts "yaml ok"' .github/workflows/site.yml .github/workflows/site-infra.yml
command -v actionlint >/dev/null && actionlint .github/workflows/site.yml .github/workflows/site-infra.yml || echo "actionlint not installed; skipped"
```

Expected: `yaml ok`. actionlint, if installed, prints no errors.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/site.yml .github/workflows/site-infra.yml
git commit -m "Add GitHub Actions to build, test and deploy the site

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Site README

**Files:**
- Create: `site/README.md`

**Interfaces:**
- Consumes: Make targets (Task 14) and workflow names (Task 15).
- Note: `site/**` is excluded from the content collection, so this file never becomes a page.

- [ ] **Step 1: Write the README**

`site/README.md`:

````markdown
# Agentic Field Guide (website)

The website at [agenticfieldguide.ai](https://agenticfieldguide.ai) is built from this repo's markdown. The repo's `README.md` drives the navigation: add a lab there and it appears on the site. Nothing is written twice.

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | >= 22.12 |
| npm | >= 10 |
| Terraform | >= 1.12 (infra only) |
| Azure CLI | 2.86+ logged in with `az login` (infra only) |
| GitHub CLI | `gh` logged in (deploy token only) |

## Quickstart

```bash
cd site
make install      # npm ci
make dev          # http://localhost:4321 (search works only after a build)
make test         # unit tests
make test-e2e     # build + Playwright
```

Run every command from `site/`. The build reads the repo root at `..`.

## How content maps to pages

- `path/to/lab.md` → `/path/to/lab/`. A folder linked with a GitHub `tree/main/...` URL → `/path/to/folder/`, showing its markdown and code files.
- The README's `## Labs` section, read top to bottom:
  - `##` starts a section.
  - `###` starts a track.
  - List items are labs; nested items are sub-labs.
  - `[x]()` means coming soon.
- Links to `github.com/AdminTurnedDevOps/Agentic-AI-The-Hard-Way/(blob|tree)/main/...` become site links. A link to a missing file fails the build.
- Pages not linked from the README are built but left out of the navigation; the build lists them as warnings.

## Deploy

1. `make infra-plan`, review the plan, then `make infra-apply`. This creates the resource group, the Static Web App (Free), the Azure DNS zone, and the apex domain records.
2. `make deploy-token` stores the deploy token as the GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN`.
3. Push to `main`. The `site` workflow builds, tests, and deploys. Same-repo PRs get preview URLs.
4. One-time: in Squarespace Domains, go to **DNS → Domain Nameservers → Use Custom Nameservers**. Enter the four values from `terraform -chdir=infra output name_servers`. This turns off Squarespace DNSSEC. Propagation takes up to 48 hours, and apex validation up to 72.

Check progress:

```bash
dig NS agenticfieldguide.ai +short
az staticwebapp hostname show -n agentic-field-guide -g rg-agentic-field-guide --hostname agenticfieldguide.ai --query status
curl -sI https://agenticfieldguide.ai | grep -i content-security-policy
```

If validation stays pending after DNS has moved to Azure, set `txt_record_name = "_dnsauth"` (for example `TF_VAR_txt_record_name=_dnsauth`), then re-run plan and apply.

## Teardown

```bash
make infra-destroy   # deletes the Static Web App, DNS zone and resource group
```

Point the domain's nameservers back to Squarespace first, or the domain stops resolving.

## Project structure

```text
site/
  src/lib/        README parser, routes, variables, repo access
  src/plugins/    remark plugins (links, code variables, H1 demotion)
  src/pages/      home, [...slug] (labs and folders), 404
  src/scripts/    client scripts (copy, fill-in, search, theme, arrow)
  scripts/        post-build: CSP config, link check
  tests/          unit (vitest) and e2e (Playwright)
  infra/          Terraform for Azure
```
````

- [ ] **Step 2: Verify it stays out of the site**

Run: `npm run build && test ! -e dist/site/README/index.html && echo "not published"`
Expected: `not published`.

- [ ] **Step 3: Commit**

```bash
git add site/README.md
git commit -m "Document site setup, deploy and teardown

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Go live (needs author approval at each marked step)

**Files:** none (operations only).

**Interfaces:**
- Consumes: everything above.

Each **[APPROVAL]** step creates, changes, or publishes something outside this machine. Ask the author first and wait for an explicit yes.

- [ ] **Step 1: Full local verification**

Run in `site/`: `npm ci && npm test && npm run check && npm run build && npx playwright test`
Expected: all green. Paste the summary lines into the hand-off message.

- [ ] **Step 2: [APPROVAL] Create Azure resources**

The author runs `az login`. Then:

```bash
make infra-plan
```

Show the plan summary (`Plan: N to add, 0 to change, 0 to destroy`) to the author, and on approval:

```bash
make infra-apply
terraform -chdir=infra output name_servers
```

Azure's apex guide for Azure DNS says the portal creates "TXT and ALIAS records" automatically, so an alias A record to a Static Web App is expected to work.

If `azurerm_dns_a_record.apex` still fails because Azure DNS rejects the alias target, stop and tell the author. The fallback, applied only with the author's approval:
1. Read `stableInboundIP` from the Static Web App's **Overview → JSON View** in the portal (per Microsoft's apex guide).
2. Change the apex record to point at that IP instead of the resource. The apex keeps working, but traffic goes to one regional host instead of using global distribution (spec section 7):

```hcl
resource "azurerm_dns_a_record" "apex" {
  name                = "@"
  zone_name           = azurerm_dns_zone.site.name
  resource_group_name = azurerm_resource_group.site.name
  ttl                 = 3600
  records             = ["<stableInboundIP from the portal>"] # replaces target_resource_id
}
```

- [ ] **Step 3: [APPROVAL] Store the deploy token in GitHub**

```bash
make deploy-token
gh secret list --repo AdminTurnedDevOps/Agentic-AI-The-Hard-Way | grep AZURE_STATIC_WEB_APPS_API_TOKEN
```

Expected: the secret is listed. The token never prints to the terminal.

- [ ] **Step 4: [APPROVAL] Push the branch and open a PR**

```bash
git push -u origin agentic-field-guide-site
gh pr create --title "Add Agentic Field Guide website" --body-file - <<'EOF'
Adds a static website for the labs (agenticfieldguide.ai), built from the repo's markdown, plus Terraform for Azure Static Web Apps and DNS.

- Design spec: docs/superpowers/specs/2026-10-04-agentic-field-guide-site-design.md
- Plan: docs/superpowers/plans/2026-10-04-agentic-field-guide-site.md
- Content edits: image-syntax links fixed, alt text added (please check the wording), README link to the site.
- CSP adds 'wasm-unsafe-eval' for Pagefind search.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
gh pr checks --watch
```

Expected:
- The `site` workflow passes.
- The `deploy` job comments a preview URL on the PR.
- Open the preview and confirm the home page, a lab page, fill-in, and search.

- [ ] **Step 5: Author merges the PR**

The author merges. The push to `main` deploys production at `https://<default_host_name>`. Verify:

```bash
curl -sI "https://$(terraform -chdir=site/infra output -raw default_host_name)/" | grep -iE '^HTTP|content-security-policy'
```

Expected: `HTTP/2 200` and the CSP header.

- [ ] **Step 6: Author switches nameservers at Squarespace**

Squarespace Domains → `agenticfieldguide.ai` → **DNS → Domain Nameservers → Use Custom Nameservers** → authenticate → **Continue** (DNSSEC off) → enter the four `name_servers` → **Save**.

- [ ] **Step 7: Verify the domain (after propagation)**

```bash
dig NS agenticfieldguide.ai +short
az staticwebapp hostname show -n agentic-field-guide -g rg-agentic-field-guide --hostname agenticfieldguide.ai --query status -o tsv
curl -sI https://agenticfieldguide.ai | grep -iE '^HTTP|content-security-policy'
```

Expected:
- The nameservers are `*.azure-dns.*`.
- The hostname status is `Ready`.
- `HTTP/2 200` with the CSP header.

- If the status is `Failed`: the custom domain was created days before the nameservers moved, and validation may have timed out. With the author's approval, re-create it after `dig` shows Azure nameservers: `TF_VAR_subscription_id="$(az account show --query id -o tsv)" terraform -chdir=site/infra apply -replace=azurerm_static_web_app_custom_domain.apex`.
- If the status stays `Validating` more than 24 hours after `dig` shows Azure nameservers: switch `txt_record_name` to `_dnsauth` (with the author's approval) and re-apply.
