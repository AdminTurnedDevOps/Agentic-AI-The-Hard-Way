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

Both `agenticfieldguide.ai` and `www.agenticfieldguide.ai` are configured. The Free plan allows 2 custom domains and 3 preview (staging) environments per app. Close or merge stale PRs if previews stop deploying.

Check progress:

```bash
dig NS agenticfieldguide.ai +short
az staticwebapp hostname show -n agentic-field-guide -g agenticfieldguide --hostname agenticfieldguide.ai --query status
az staticwebapp hostname show -n agentic-field-guide -g agenticfieldguide --hostname www.agenticfieldguide.ai --query status
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
