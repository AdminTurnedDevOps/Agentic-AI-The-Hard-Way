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
