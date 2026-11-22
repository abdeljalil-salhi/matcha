.DEFAULT_GOAL := help

PYTHON_BOOTSTRAP ?= python3.12
PYTHON ?= .venv/bin/python
NPM ?= npm
DOCKER ?= docker
COMPOSE ?= $(DOCKER) compose
POSTGRES_TEST_IMAGE ?= postgres:17
PYTEST_ARGS ?= -q
SERVICES ?=
export MATCHA_TEST_DSN

.PHONY: help env venv install backend-install frontend-install hooks up down restart \
	build backend-build frontend-build dev frontend logs ps health migrate seed \
	shell db-shell format lint test backend-test frontend-test smoke check

help: ## List development commands (default)
	@awk 'BEGIN { FS = ":.*## "; printf "Usage: make <target>\n\n" } /^[a-zA-Z][a-zA-Z0-9_-]*:.*## / { printf "  %-18s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

env: ## Copy missing environment templates without overwriting local settings
	@if [ ! -f .env ]; then cp .env.example .env; printf 'Created .env; fill in the required secrets before starting Docker.\n'; fi
	@if [ ! -f frontend/.env ]; then cp frontend/.env.example frontend/.env; printf 'Created frontend/.env; match VITE_API_URL to your API port.\n'; fi

venv: ## Create the Python virtual environment if missing
	@test -x "$(PYTHON)" || $(PYTHON_BOOTSTRAP) -m venv .venv

install: backend-install frontend-install ## Install development dependencies and Git hooks
	@$(MAKE) hooks

backend-install: venv ## Install Python development dependencies
	$(PYTHON) -m pip install -r requirements-dev.txt

frontend-install: ## Install frontend dependencies from the lockfile
	$(NPM) --prefix frontend ci

hooks: ## Install Black and Flake8 pre-commit hooks
	$(PYTHON) -m pre_commit install --install-hooks

up: ## Build and start the backend stack, applying migrations
	$(COMPOSE) up --build -d

down: ## Stop the backend stack and preserve database volumes
	$(COMPOSE) down

restart: ## Recreate services to apply .env changes, preserving volumes
	$(COMPOSE) up -d --force-recreate

build: backend-build frontend-build ## Build backend images and the production frontend

backend-build: ## Build the backend Docker images
	$(COMPOSE) build

frontend-build: ## Type-check and build the production frontend
	$(NPM) --prefix frontend run build

dev: up ## Start the backend, then run the frontend in the foreground
	@$(MAKE) frontend

frontend: ## Run the Vite development server in the foreground
	$(NPM) --prefix frontend run dev

logs: ## Follow logs; optionally pass SERVICES="api worker"
	$(COMPOSE) logs --follow --tail=100 $(SERVICES)

ps: ## Show backend service status
	$(COMPOSE) ps

health: ## Check API/database readiness inside the running API container
	$(COMPOSE) exec -T api python -c 'from urllib.request import urlopen; print(urlopen("http://127.0.0.1:8000/api/health", timeout=5).read().decode())'

migrate: ## Build the setup image and apply pending SQL migrations
	$(COMPOSE) run --rm --build setup python -m server.manage migrate

seed: migrate ## Seed 500 demo profiles; evaluator sessions are revoked
	$(COMPOSE) run --rm setup python -m server.manage seed

shell: ## Open a shell inside the API container
	$(COMPOSE) exec api sh

db-shell: ## Open psql using the database container's configured account
	$(COMPOSE) exec db sh -c 'exec psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

format: ## Format backend and test Python files with Black
	$(PYTHON) -m black server tests

lint: ## Check Python formatting and Flake8
	$(PYTHON) -m black --check server tests
	$(PYTHON) -m flake8 server tests

test: backend-test frontend-test ## Run both test suites

backend-test: ## Run pytest against a disposable database or MATCHA_TEST_DSN
	@set -eu; \
	if [ -n "$$MATCHA_TEST_DSN" ]; then \
		"$(PYTHON)" -m pytest $(PYTEST_ARGS); \
	else \
		test_container=$$($(DOCKER) run --rm -d -p 127.0.0.1::5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=matcha_test "$(POSTGRES_TEST_IMAGE)"); \
		trap '$(DOCKER) rm -f "$$test_container" >/dev/null 2>&1 || true' 0; \
		trap 'exit 130' INT; trap 'exit 143' HUP TERM; \
		attempt=0; \
		until $(DOCKER) exec "$$test_container" pg_isready -U postgres -d matcha_test >/dev/null 2>&1; do \
			attempt=$$((attempt + 1)); \
			if [ "$$attempt" -ge 30 ]; then $(DOCKER) logs "$$test_container"; exit 1; fi; \
			sleep 1; \
		done; \
		test_address=$$($(DOCKER) port "$$test_container" 5432/tcp); \
		MATCHA_TEST_DSN="postgresql://postgres@$$test_address/matcha_test" "$(PYTHON)" -m pytest $(PYTEST_ARGS); \
	fi

frontend-test: ## Run Vitest component and regression tests
	$(NPM) --prefix frontend test

smoke: ## Verify Compose startup, email delivery, and login in an isolated stack
	$(PYTHON) -m tests.compose_smoke

check: lint test frontend-build ## Run lint, both test suites, and the frontend build
