# PayGate convenience entrypoint.  Thin wrapper around pnpm / hatch / forge
# for common dev workflows.
.PHONY: help install dev build test lint typecheck clean docker-up docker-down \
        proxy doctor verify fmt py-install py-test py-lint forge-build forge-test

SHELL := /bin/bash

help:
	@echo "PayGate Make targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-16s %s\n", $$1, $$2}'

# -- Node / workspaces -----------------------------------------------------
install: ## Install JS workspaces
	pnpm install

dev: ## Start every dev server via turbo
	pnpm dev

build: ## Build everything
	pnpm build

test: ## Run all JS tests
	pnpm test

lint: ## Run lint
	pnpm lint

typecheck: ## Run tsc --noEmit across workspaces
	pnpm typecheck

clean: ## Remove build artefacts + node_modules caches
	pnpm clean

fmt: ## Format every file we can
	pnpm format
	hatch run -e lint ruff format packages/paygate-python || true

# -- Python ----------------------------------------------------------------
py-install: ## Create hatch env for the python package
	cd packages/paygate-python && hatch env create

py-test: ## Run python tests
	cd packages/paygate-python && hatch run test

py-lint: ## ruff + mypy
	cd packages/paygate-python && hatch run lint && hatch run typecheck

# -- Solidity --------------------------------------------------------------
forge-build: ## Compile contracts
	cd contracts/base && forge build

forge-test: ## Run contract tests
	cd contracts/base && forge test -vvv

# -- Local docker stack ----------------------------------------------------
docker-up: ## Start postgres, redis, proxy, api, dashboard
	docker compose up -d

docker-down: ## Stop the stack
	docker compose down

# -- Handy CLI shortcuts ---------------------------------------------------
proxy: ## Run the proxy against a local upstream (override UPSTREAM to point elsewhere)
	pnpm --filter @paygate/node exec paygate start --config paygate.config.yml --upstream $${UPSTREAM:-http://localhost:3000}

doctor: ## Run paygate doctor
	pnpm --filter @paygate/node exec paygate doctor --config paygate.config.yml

verify: ## forge-style verify (CHAIN=base|solana TX=...)
	pnpm --filter @paygate/node exec paygate verify --chain $$CHAIN --tx $$TX
