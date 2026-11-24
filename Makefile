.DEFAULT_GOAL := up

DOCKER ?= docker
COMPOSE ?= $(DOCKER) compose
PYTEST_ARGS ?= -q
SERVICES ?=
export MATCHA_TEST_DSN
export MATCHA_UID := $(shell id -u)
export MATCHA_GID := $(shell id -g)
export MATCHA_WORKSPACE := $(CURDIR)

.PHONY: help env install backend-install frontend-install up down restart build \
	backend-build frontend-build dev frontend logs ps health migrate seed shell \
	db-shell format lint test backend-test frontend-test smoke check up-local up-lan dev-local dev-lan

help: ## List development commands
	@awk 'BEGIN { FS = ":.*## "; printf "Usage: make <target>\n\n" } /^[a-zA-Z][a-zA-Z0-9_-]*:.*## / { printf "  %-18s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

env: ## Create local env files and generate missing secrets inside Docker
	@$(DOCKER) run --rm --network none --user "$(MATCHA_UID):$(MATCHA_GID)" \
		--mount "type=bind,source=$(CURDIR),target=/workspace" \
		--workdir /workspace python:3.12-slim python scripts/bootstrap_env.py

up: env ## Build and start the full app, waiting for frontend and API health
	$(COMPOSE) up --build -d --wait

dev: up ## Start the full Docker development stack with frontend hot reload

up-local: ## Build and start localhost-only stack using .env.local
	@test -f .env.local || (echo "Missing .env.local. Copy .env.local.example to .env.local and fill secrets." && exit 1)
	MATCHA_ENV_FILE=.env.local $(COMPOSE) --env-file .env.local up --build -d --wait

up-lan: ## Build and start LAN/Wi-Fi stack using .env
	@test -f .env || $(MAKE) env
	MATCHA_ENV_FILE=.env $(COMPOSE) --env-file .env up --build -d --wait

dev-local: up-local ## Start localhost-only stack (alias for up-local)

dev-lan: up-lan ## Start LAN/Wi-Fi stack (alias for up-lan)

frontend: env ## Start the frontend container and its API dependencies
	$(COMPOSE) up --build -d --wait frontend

down: ## Stop the stack and preserve database volumes
	$(COMPOSE) down

restart: env ## Recreate services to apply env changes without rebuilding images
	$(COMPOSE) up -d --force-recreate --wait

build: env ## Build application images; dependencies are installed inside Docker
	$(COMPOSE) build

install: build ## Install application dependencies by building Docker images

backend-build: env ## Build backend images
	$(COMPOSE) build api setup worker

backend-install: backend-build ## Install backend dependencies inside Docker

frontend-install: env ## Install frontend dependencies inside its Docker image
	$(COMPOSE) build frontend

frontend-build: env ## Type-check and build the frontend inside Docker
	$(COMPOSE) run --rm --build --no-deps frontend npm run build

logs: ## Follow logs; optionally pass SERVICES="frontend api worker"
	$(COMPOSE) logs --follow --tail=100 $(SERVICES)

ps: ## Show service status
	$(COMPOSE) ps

health: ## Check API/database readiness inside the API container
	$(COMPOSE) exec -T api python -c 'from urllib.request import urlopen; print(urlopen("http://127.0.0.1:8000/api/health", timeout=5).read().decode())'

migrate: env ## Start PostgreSQL and apply pending SQL migrations
	$(COMPOSE) up -d --wait db
	$(COMPOSE) run --rm --build setup python -m server.manage migrate

seed: migrate ## Seed 500 demo profiles; evaluator sessions are revoked
	$(COMPOSE) run --rm setup python -m server.manage seed

shell: ## Open a shell inside the API container
	$(COMPOSE) exec api sh

db-shell: ## Open psql using the database container's configured account
	$(COMPOSE) exec db sh -c 'exec psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

format: env ## Format Python files inside the tools container
	$(COMPOSE) run --rm --build --no-deps tools python -m black server tests scripts

lint: env ## Check Python formatting and Flake8 inside Docker
	$(COMPOSE) run --rm --build --no-deps tools sh -ec 'python -m black --check server tests scripts && python -m flake8 server tests scripts'

test: backend-test frontend-test ## Run both test suites inside Docker

backend-test: env ## Run pytest with an isolated PostgreSQL container
	@set -eu; \
	if [ -n "$${MATCHA_TEST_DSN:-}" ]; then \
		$(COMPOSE) run --rm --build --no-deps -e MATCHA_TEST_DSN tools python -m pytest $(PYTEST_ARGS); \
	else \
		test_project=matcha-test-$$$$; \
		trap 'result=$$?; $(COMPOSE) -f "$(CURDIR)/compose.yaml" -p "$$test_project" down --volumes --remove-orphans >/dev/null 2>&1 || true; exit $$result' 0; \
		trap 'exit 130' INT; trap 'exit 143' HUP TERM; \
		$(COMPOSE) -f "$(CURDIR)/compose.yaml" -p "$$test_project" up -d --wait --wait-timeout 60 test-db; \
		$(COMPOSE) -f "$(CURDIR)/compose.yaml" -p "$$test_project" run --rm --build --no-deps \
			-e MATCHA_TEST_DSN=postgresql://postgres@test-db:5432/matcha_test tools python -m pytest $(PYTEST_ARGS); \
	fi

frontend-test: env ## Run frontend regression tests inside Docker
	$(COMPOSE) run --rm --build --no-deps frontend npm test

smoke: env ## Run isolated Compose/email/frontend checks using Docker tools
	$(COMPOSE) run --rm --build --no-deps smoke-tools python -m tests.compose_smoke

check: lint test frontend-build ## Run lint, tests, and the frontend build in Docker
