# Agentic Field Guide website: design

- **Date:** 2026-10-04
- **Status:** Approved in brainstorming; awaiting written-spec review
- **Domain:** `agenticfieldguide.ai`

## 1. Goal

Give readers an interactive website for this repo's labs as an alternative to reading them on GitHub. The website has the same content and structure as the repo. The markdown in the repo stays the single source of truth and stays readable on GitHub. The site is generated from it at build time, so nothing is written twice.

**Audience:** DevOps, Platform, and SRE engineers working through labs with a terminal open beside the browser.

**Success means:**

1. Every lab linked from `README.md` is readable on the site, with its images, in README order.
2. A reader can fill in values such as `INGRESS_GW_ADDRESS` once and copy commands that work as-is.
3. The site doesn't read as AI-generated (see section 4).
4. A push to `main` deploys to `https://agenticfieldguide.ai`, and the whole Azure setup is reproducible from Terraform.

**Naming:** the site is branded **Agentic Field Guide**. The GitHub repo name and the README title stay "Agentic-AI-The-Hard-Way". The README gains one line linking to the site (section 9).

## 2. Scope

**In v1:**

- Home page, lab pages, folder pages, coming-soon pages, and a 404 page.
- Sidebar navigation, previous/next links, and "View on GitHub" links.
- Copy buttons on every code block.
- Variable fill-in.
- Static search (Pagefind).
- Light and dark mode: follows the OS setting, with a manual toggle.
- Azure Static Web Apps hosting with Azure DNS for the apex domain, all in Terraform.
- A GitHub Actions workflow that builds, tests, and deploys, with pull-request previews.

**Not in v1:** progress tracking, expected-output blocks, analytics, comments, accounts, and any backend.

## 3. Architecture

```text
site/                              Astro 7 project (Node >=22.12; exact-pinned deps + package-lock.json)
  astro.config.mjs
  src/content.config.ts            glob loader over the repo's markdown
  src/lib/readme-nav.ts            README.md -> navigation model
  src/lib/vars.ts                  pure substitution/secret logic (shared by build + client)
  src/plugins/remark-repo-links.ts GitHub URLs + relative links -> site routes
  src/plugins/remark-code-vars.ts  marks $VARS in code blocks
  src/components/                  SketchBox, TrackMap, CodeBlock, VarPanel, Sidebar, PrevNext, Search, ThemeToggle
  src/layouts/  src/pages/  src/styles/
  public/fonts/                    self-hosted woff2 + OFL license files
  public/staticwebapp.config.json
  tests/unit/                      vitest
  tests/e2e/                       Playwright
  infra/                           Terraform (section 7)
  Makefile                         dev, build, test, infra-plan, infra-apply, clean
  README.md                        setup, deploy, nameserver step
.github/workflows/site.yml
```

**Build pipeline:**

1. `astro build`: the content loader reads the markdown, the remark plugins rewrite it, and pages render.
2. `pagefind --site dist`: builds the static search index.
3. Internal link check over `dist/`.
4. Deploy `dist/`.

**Content loading:** `glob({ pattern: '**/*.md', base: '..' })`, excluding `site/**`, `docs/**`, `.superpowers/**`, `.github/**`, `**/node_modules/**`, and `README.md`. The README is parsed separately (section 5.1).

- Verified by a throwaway probe on 2026-10-04: Astro 7.3.5 loads and renders `../labs/*.md` from inside `site/`.

**Routes mirror repo paths:**

- `platform-engineering-assistant/deploy-kagent.md` becomes `/platform-engineering-assistant/deploy-kagent/`.
- A folder becomes `/<folder path>/`.

## 4. Visual design ("Whiteboard")

The design comes from material already in the repo: the Excalidraw-style banner (`images/banner.png`) and the author's Excalidraw habit. It is not a style template.

**Typography:**

- **Headings, wordmark, sketch-box labels, and buttons:** Excalifont, Excalidraw's own font (SIL OFL 1.1). It matches the banner lettering. Self-hosted from the woff2 subsets in `excalidraw/excalidraw/packages/excalidraw/fonts/Excalifont`, using the upstream `unicode-range` descriptors, with the OFL text included.
- **Body text:** Atkinson Hyperlegible (`@fontsource/atkinson-hyperlegible`, OFL).
- **Code:** IBM Plex Mono (`@fontsource/ibm-plex-mono`, OFL).
- No Google Fonts requests at runtime.

**Color:** all colors are CSS custom properties with a dark-mode twin. Every color has a meaning:

- Ink `#1e1e1e` on white paper (dark mode uses Excalidraw's dark canvas).
- **Track fills:** tracks with at least one real lab get fills in README order from `[#a5d8ff blue, #d0bfff violet, #b2f2bb green, #ffd8a8 peach, #ffec99 yellow]`. The same track keeps the same color everywhere: home box, sidebar title.
- **Zero-lab tracks:** a dashed outline, no fill, and muted text. A track with at least one real lab is always solid.
- **The "Your values" sticky note** uses `#ffec99`.
- **Code-block variables:** dashed underline, yellow while empty and green once filled.
- **Current lab in the sidebar:** a hand-drawn loop in `#e8590c`.

**Sketch shapes:**

- Static boxes use irregular `border-radius` ellipses (cheap, no JavaScript).
- Rough.js draws the home-page flow arrows and box outlines.
- The handwriting font never appears in body text or code.

**Anti-"AI look" rules.** These are enforced in review. Research sources are listed in Appendix A.

- **Avoid:**
  - Inter, Roboto, Space Grotesk, Geist, Instrument Serif, and Fraunces.
  - Purple-to-blue gradients, gradient text, glassmorphism, and `rounded-2xl shadow-lg` everywhere.
  - A centered hero with a pill badge, rows of three identical icon cards, and the hero-logos-features-stats-CTA section order.
  - The same fade-up animation on every section, and count-up numbers.
  - Copy like "Elevate / Seamless / Powerful".
  - Tracked all-caps mono eyebrow labels, decorative 01/02/03 numbering, and fake window dots on code blocks.
  - A cream-and-terracotta or near-black-plus-acid-green palette.
- **Do:**
  - An asymmetric hero: README intro text on the left, the real banner on the right.
  - Box sizes that vary with content.
  - Copy pulled from the README in the author's voice.
  - Motion limited to the copy confirmation and focus/hover states, all respecting `prefers-reduced-motion`.
  - Visible focus states that meet WCAG AA contrast in both themes.

### 4.1 Home page

- **Header:** the wordmark "Agentic Field Guide", plus links to Scenarios, Prerequisites, Workstation, and GitHub, the search box (`/` shortcut), and the theme toggle.
- **Hero:** the heading and the README intro paragraph on the left; `images/banner.png` on the right with descriptive alt text. There is **no work-in-progress note**.
- **"Pick a scenario":**
  - A "Start here" box (Prerequisites, Kubernetes Cluster Creation) with a sketched arrow to the track boxes.
  - **Each track box:**
    - Shows the track title, the scenario blurb from the README's `## The Scenarios`, its lab list, and a count ("6 labs", or "1 lab, 6 coming soon").
    - Each lab name links to that lab. Clicking anywhere else on the box opens the track's first real lab, which is the "before you start" item if one exists.
    - Coming-soon items are italic text, not links.
    - Box size varies with how many labs the track has.
- **Workstation section:** links to the workstation pages.

### 4.2 Lab page

- **Three columns:**
  - **Sidebar:** the current track's title in its fill color; the README's lab list, with groups shown as nested lists; the current lab circled; coming-soon items in italics.
  - **Main content:** title, a breadcrumb (track, then position, then "View on GitHub"), the rendered markdown, and previous/next sketch buttons.
  - **"Your values" sticky note:** sticky, slightly rotated.
- **Mobile:** the sidebar collapses into a menu, and the sticky note moves above the first code block.
- **Images:**
  - Optimized at build time.
  - Shown with a thin ink border.
  - Wrapped in a link to the full-size original.
- **Code blocks:** dark, with no window chrome and a copy button.

### 4.3 Other pages

- **Folder page:** for README links of the form `tree/main/<dir>`. It renders the folder's `.md` files, then each other text file (`.yaml`, `.py`, …) as a titled code block with a copy button, sorted by name.
- **Coming-soon page:** for linked files that are empty, such as `vllm-llmd.md` and `inference-with-agw.md`.
- **404 page:** a sketch-styled page with links home and to search.

## 5. Content pipeline

### 5.1 README → navigation (`readme-nav.ts`)

The README is parsed into an mdast tree with remark, then walked **linearly from `## Labs` to the end of the file**. The walk does not stop at the next `##`, because `## AI Workstation Setup` sits between `## Labs` and the first track.

| README element | Becomes |
|---|---|
| `## Labs` | The "Start here" section. Its paragraph links (Prerequisites, Kubernetes Cluster Creation) are its items. |
| Any other `##` (e.g. `## AI Workstation Setup`) | A nav section. Its list is its items. |
| Any `###` | A track, wherever it appears after `## Labs`. |
| A paragraph link inside a track (e.g. `**prereq**: [...]()`, `[prereq - learn Substrate](...)`) | The track's "before you start" item. |
| A top-level list item with a link | A lab. |
| A list item with no link but with linked children (e.g. "Agentgateway installation & configuration:") | A group. Its children are its labs. |
| A nested list item with a link | A sub-lab under its parent. |
| A nested list item with no link (e.g. "The app is intentionally broken…") | A note: shown under the lab on the home page and in the sidebar tooltip. |
| An empty link `[x]()` | A coming-soon item, with no link. |
| A link to an existing but empty file | A coming-soon item that links to the coming-soon page. |
| A `###` with no list (e.g. "Isolated Environments With Agent Substrate", body "WIP") | A zero-lab track: dashed box. |

**Scenario blurbs:** each Labs `###` is matched to a `## The Scenarios` `###` by **prefix**. The Labs heading must start with the Scenarios heading text, case-insensitively; for example, "Isolated Agents With kagent + Agent substrate" matches "Isolated Agents". If nothing matches, the track's first paragraph is used, or no blurb.

**Lab titles:** taken from the README link text, not from the file.

**Previous/next:** follows the flattened README order within a track, skipping coming-soon items.

### 5.2 Link rewriting (`remark-repo-links.ts`)

- **Rewritten:** only `https://github.com/AdminTurnedDevOps/Agentic-AI-The-Hard-Way/(blob|tree)/main/<path>`, plus relative links to `.md` files. These become site routes.
- **External, untouched:** every other URL, including `agentic-demo-repo`, kagent.dev, and agentgateway.dev.
- **Build failure:** an internal link whose target file doesn't exist.

### 5.3 Images

- Relative markdown images (`../images/x.png`, `images/x.png`) go through Astro's image pipeline.
- **Unverified:** whether Vite serves files from `../` during `astro dev` without `vite.server.fs.allow: ['..']`.
  - **Fallback:** a pre-build step that copies the repo's image folders into `site/src/assets/repo/`, mirroring their paths.
- **Build failure:** a missing image file.
- **Build warning:** an image file nothing references, such as `isolated-agent/images/{1,onboard,onboardimage}.png` today.

### 5.4 Pages not in the README

- Markdown files the README never links, such as `platform-engineering-assistant/prompt-guard.md`, are still built and searchable but left out of the navigation.
- The build prints them as a warning.

## 6. Interactive behavior

### 6.1 Variable fill-in

- **Build time:** `remark-code-vars` wraps every `$NAME` or `${NAME}` (pattern `[A-Z][A-Z0-9_]+`) in every code block as `<span data-var="NAME">`.
  - **Excluded:** assignment targets (`export NAME=`, `NAME=`), `$(` command substitutions, lowercase names, and `HOME PATH USER PWD SHELL`.
- **Sticky note:** lists only the variables used on the current page.
- **Storage:** values are kept in `localStorage`, site-wide, under the key `afg:vars`, so a value entered in one lab carries into the next. A "clear all" link empties it.
- **Secrets:** names matching `/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/` show on the note as "set this in your shell". They get no input box, are never stored, and are never substituted.
- **Blank value:** leaves `$NAME` exactly as written.
- **Insertion:** values are inserted with `textContent`, never `innerHTML`.
- **Without JavaScript:** code shows the original text.
- **If `localStorage` throws:** values live in memory for the session only.

### 6.2 Copy

- Every code block has a copy button.
- It copies the text **after substitution**. Secrets and blank values stay as `$NAME`.
- The confirmation is a brief hand-drawn "copied"; under reduced motion, a static label.

### 6.3 Search

- Pagefind indexes `dist/` after the build.
- A custom Excalifont-styled results dropdown uses the Pagefind JS API.
- **Limitation:** the index exists only in `build`/`preview`, not in `astro dev`. In dev, the search box shows a note.

### 6.4 Theme

- Follows `prefers-color-scheme` by default, and the header toggle overrides it (stored in `localStorage` as `afg:theme`).
- A tiny inline `<head>` script applies the theme before first paint, so dark-mode users don't see a flash of the light theme. It is allowed in the CSP by its SHA-256 hash.

## 7. Azure infrastructure (`site/infra/`, Terraform)

- **Terraform:** `>= 1.12`, provider `hashicorp/azurerm` pinned at **`5.8.0`**.
  - The repo `.gitignore` excludes `*.lock.hcl`, so this exact version pin is what keeps the provider version fixed.
- **State:** local, matching `k8s-terraform/` and already gitignored.

| Resource | Notes |
|---|---|
| `azurerm_resource_group` | Variable name; default region `eastus2`. |
| `azurerm_static_web_app` | `sku_tier`/`sku_size = "Free"`. `lifecycle { ignore_changes = [repository_url, repository_branch] }`, because deploying with the API key updates those fields in Azure. Provider docs note this. |
| `azurerm_dns_zone` | `agenticfieldguide.ai`. Its `name_servers` are a Terraform output. |
| `azurerm_static_web_app_custom_domain` | `domain_name = "agenticfieldguide.ai"`, `validation_type = "dns-txt-token"`. Provider docs say apex domains must use this. |
| `azurerm_dns_txt_record` | `value = validation_token`. `lifecycle { ignore_changes = [record] }`, because the token is cleared after validation succeeds. Record name is a variable `txt_record_name`, default `"@"`, per Microsoft's apex guide. |
| `azurerm_dns_a_record` at `@` | `target_resource_id = azurerm_static_web_app.<name>.id` (an alias record). |

**Outputs:**

- `name_servers`
- `default_host_name`
- `api_key` (sensitive): the deploy token. The operator stores it once as the GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN`. It is never committed.

**Unverified, with fallbacks:**

1. **Azure DNS alias to a Static Web App.** The provider accepts any `target_resource_id`, but it isn't confirmed that Azure DNS accepts a Static Web App as an alias target.
   - **Fallback:** a `www` CNAME to `default_host_name` as the main hostname, with the apex added as a second custom domain that redirects to `www`.
   - A plain `A` record to the stable inbound IP is the last resort, because it loses global distribution.
2. **TXT record name for apex validation.** Microsoft's apex guide uses `@`; the provider example for subdomains uses `_dnsauth.<sub>`.
   - **Check:** after apply and propagation, if `az staticwebapp hostname show` doesn't report the domain `Ready`, set `txt_record_name = "_dnsauth"` and re-apply.

**One manual step:** set the four `name_servers` at the registrar. Apex changes can take up to 72 hours to propagate.

## 8. CI/CD (`.github/workflows/site.yml`)

**Triggers:**

- `push` to `main` and `pull_request` (`opened`, `synchronize`, `reopened`, `closed`)
- Path filter: `**/*.md`, `images/**`, `**/images/**`, `the-broken-apps/**`, `the-observer/**`, `site/**`, and the workflow file itself.

**Jobs:**

1. **`build-test`** (all PRs, including forks, and all pushes):
   - Node 22 and `npm ci`.
   - vitest.
   - `astro check`.
   - `astro build`, then `pagefind --site dist`.
   - The internal link check.
   - Playwright tests against `astro preview`.
   - Uploads `dist/` as an artifact.
2. **`deploy`:**
   - **Runs when:** after `build-test`, on pushes to `main`, or on PRs where `github.event.pull_request.head.repo.full_name == github.repository` (fork PRs have no secrets).
   - **Steps:** downloads the artifact and runs `Azure/static-web-apps-deploy@v1` with `action: upload`, `app_location: site/dist` (relative to the repo root), and `skip_app_build: true`.
   - PRs get a preview URL; `main` deploys to production.
3. **`close-preview`:** on `pull_request` `closed` from the same repo, runs the deploy action with `action: close` to delete the preview environment.
4. **`infra-check`:** on changes to `site/infra/**`, runs `terraform fmt -check` and `terraform validate` (with `-backend=false`). **CI never runs `apply`.**

All third-party actions are pinned to a full commit SHA.

## 9. Content edits to existing files

Approving this spec approves these edits and nothing else:

| File:line | Change |
|---|---|
| `platform-engineering-assistant/deploy-agw.md:17` | `![here](https://agentgateway.dev/...)` → `[here](...)`. Image syntax was used for a link. |
| `isolated-agent/installation.md:3` | `![Agent Substrate](https://github.com/agent-substrate/substrate)` → `[Agent Substrate](https://github.com/agent-substrate/substrate)`. The author added the URL; the leading `!` still makes it image syntax. |
| `isolated-agent/kagent-substrate.md:86` | `![here](https://kagent.dev/...)` → `[here](...)`. |
| `README.md:7` | Add alt text to the banner: "Agentic AI workloads architecture: AI agent, orchestrator, and task execution with feedback and human-in-the-loop review". |
| `platform-engineering-assistant/gateway-creation-update-modelconfig.md:181`, `:188` | Add alt text to the two screenshots. |
| `workstation-setup/a-few-key-features.md:7`, `:8`, `:13` | Add alt text to the three plugin screenshots. |
| `workstation-setup/terminal.md:18`, `:19` | Add alt text to the two cmux screenshots. |
| `README.md` (after the title) | Add one line: "Prefer reading in a browser? Visit [agenticfieldguide.ai](https://agenticfieldguide.ai)." |
| `.gitignore` | Append `.superpowers/`, `site/node_modules/`, `site/dist/`, `site/.astro/`, `site/test-results/`, `site/playwright-report/`, `site/infra/.terraform/`. |

Alt-text wording is drafted during implementation from what each image shows, and listed in the PR for the author to adjust.

## 10. Error handling

| Condition | Result |
|---|---|
| Internal link to a missing file | Build fails, naming the file and line. |
| Missing image file | Build fails, naming the file and line. |
| README structure the parser can't place (e.g. a list under `## Labs` before any `###`) | Build fails, naming the README line. |
| `.md` file not linked from the README | Build warning. Page built, not in the navigation. |
| Image file never referenced | Build warning. |
| `localStorage` unavailable | Fill-in and theme work for the session only. No error. |
| JavaScript disabled | Content, navigation, and images all work. Copy, fill-in, search, and the theme toggle are unavailable. |

## 11. Security

- **CSP** in `staticwebapp.config.json`: `default-src 'self'`, `img-src 'self' data:`, `font-src 'self'`, `script-src 'self' 'sha256-<theme script>'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`. Also `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.
- **`style-src`:** set `build.inlineStylesheets: 'never'` so Astro emits external CSS. Rough.js may set inline `style` attributes; if a Playwright CSP check shows violations, allow `style-src 'self' 'unsafe-inline'`, and record that in the PR.
- **Secrets:** never stored or substituted (section 6.1). The deploy token lives only in GitHub secrets and Terraform state.
- **No third-party requests at runtime.**

## 12. Testing

**Unit tests (vitest):**

- **`readme-nav`:**
  - Against the real `README.md`, asserting track names, lab counts, groups, coming-soon items, and the Workstation section.
  - Against fixtures for: nested items, empty links, prereq paragraphs, folder links, a zero-lab track, and the `##`-between-sections layout.
- **`remark-repo-links`:**
  - In-repo blob and tree links, relative links, external links left untouched, and the `agentic-demo-repo` exclusion.
  - Missing-target failure.
- **`remark-code-vars`:**
  - `$X` and `${X}` forms, assignments excluded, `$(...)` excluded, lowercase excluded, and shell builtins excluded.
- **`vars.ts`:**
  - Substitution, blank values kept, secret detection, and copy text.

**Browser tests (Playwright, Chromium):**

1. The home page renders every README track. A track box and a lab link inside it navigate correctly.
2. Fill in `INGRESS_GW_ADDRESS` on the gateway lab: the code updates, the copied text contains the value, and the value persists on the next lab.
3. On a page using `ANTHROPIC_API_KEY`: no input box, nothing in `localStorage`, and `$ANTHROPIC_API_KEY` kept in the copied text.
4. Search for "substrate" returns the Substrate install lab.
5. No CSP violations in the console on the home page and one lab page.

**Infrastructure:** `terraform fmt -check` and `terraform validate` in CI. After the first manual `apply`, verify:

- `az staticwebapp hostname show` reports the domain `Ready`.
- `curl -sI https://agenticfieldguide.ai` returns 200 with the CSP header.

## Appendix A: research sources (avoiding the AI look)

- funboy322/avoid-ai-design, first- and second-order tells and "grounding in the subject": https://github.com/funboy322/avoid-ai-design
- Mania Design, "Spot the Slop": https://www.mania.design/blog/spot-the-slop-a-ui-designers-guide-to-fixing-ai-defaults/
- 925 Studios, "AI Slop Fonts and Gradients": https://www.925studios.co/blog/ai-slop-design-tells
- 925 Studios, "AI Slop Web Design guide": https://www.925studios.co/blog/ai-slop-web-design-guide

## Appendix B: references checked

- Astro glob loader options: https://docs.astro.build/en/reference/content-loader-reference/
- Static Web Apps apex domain (external DNS): https://learn.microsoft.com/en-us/azure/static-web-apps/apex-domain-external
- Static Web Apps apex domain (Azure DNS): https://learn.microsoft.com/en-us/azure/static-web-apps/apex-domain-azure-dns
- `azurerm_static_web_app_custom_domain`, `azurerm_static_web_app`, and `azurerm_dns_a_record` docs: `hashicorp/terraform-provider-azurerm` `website/docs/r/`
- Excalifont license (OFL 1.1): `excalidraw/excalidraw/packages/excalidraw/fonts/Excalifont/index.ts`
