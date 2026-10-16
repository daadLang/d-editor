# ض IDE — developer shortcuts around the Wails 3 CLI.
#
# Everything here is a thin wrapper over `wails3` (which bundles Task), so the
# raw commands keep working too: `wails3 dev`, `wails3 build`, `wails3 package`.
# Run `make` (or `make help`) to list the targets.

APP_NAME     ?= daad-ide
BIN_DIR      ?= bin
DIST_DIR     ?= release
WAILS3       ?= wails3
WAILS_VERSION ?= v3.0.0-beta.29
CROSS_IMAGE  ?= wails-cross

# Targets built by `make build-all` as <os>/<arch>. Windows goes first because
# it is cross-compiled with plain Go (no Docker); Linux amd64 and macOS use the
# Docker image from `make setup-docker`. Override on the command line:
#   make build-all PLATFORMS="windows/amd64 linux/amd64"
#
# linux/arm64 is not in the default set: the cross image compiles Linux with
# its native gcc, so on an x86 machine it needs an emulated arm64 container
# (slow, see `make build-linux-arm64`). Add it to PLATFORMS if you want it.
PLATFORMS    ?= windows/amd64 windows/arm64 linux/amd64 darwin/arm64 darwin/amd64

# Every <os>/<arch> that gets its own build-<os>-<arch> target.
ALL_TARGETS  := windows/amd64 windows/arm64 linux/amd64 linux/arm64 darwin/arm64 darwin/amd64

ARM64_IMAGE  ?= wails-cross-arm64
HOST_ARCH    := $(shell uname -m)

.DEFAULT_GOAL := help

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

# $(call exe,<os>) -> ".exe" for Windows, empty otherwise
exe = $(if $(filter windows,$(1)),.exe)

# $(call build_one,<os>,<arch>): build one target and park the result in
# $(DIST_DIR), because every platform writes to the same $(BIN_DIR)/$(APP_NAME).
define build_one
	@echo "==> Building $(1)/$(2)"
	$(WAILS3) build GOOS=$(1) GOARCH=$(2)
	@mkdir -p $(DIST_DIR)
	@mv -f $(BIN_DIR)/$(APP_NAME)$(call exe,$(1)) $(DIST_DIR)/$(APP_NAME)-$(1)-$(2)$(call exe,$(1))
	@echo "    -> $(DIST_DIR)/$(APP_NAME)-$(1)-$(2)$(call exe,$(1))"
endef

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*## "; printf "Usage: make \033[36m<target>\033[0m\n\n"} /^[a-zA-Z0-9_.-]+:.*## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: check-wails3
check-wails3:
	@command -v $(WAILS3) >/dev/null 2>&1 || { echo "wails3 CLI not found. Run 'make setup' first."; exit 1; }

# `go test`/`go vet` compile main.go, whose //go:embed needs frontend/dist to
# exist. A real build replaces this placeholder.
.PHONY: embed-placeholder
embed-placeholder:
	@mkdir -p frontend/dist
	@[ -n "$$(ls -A frontend/dist 2>/dev/null)" ] || echo "placeholder" > frontend/dist/.gitkeep

# ----------------------------------------------------------------------------
# Setup
# ----------------------------------------------------------------------------

.PHONY: setup
setup: ## Install the wails3 CLI, Go modules and frontend dependencies
	go install github.com/wailsapp/wails/v3/cmd/wails3@$(WAILS_VERSION)
	go mod tidy
	cd frontend && yarn install

.PHONY: setup-docker
setup-docker: check-wails3 ## Build the Docker image used for Linux/macOS cross-compilation (~800MB)
	$(WAILS3) task setup:docker

.PHONY: doctor
doctor: check-wails3 ## Check that the system has everything Wails needs
	$(WAILS3) doctor

# ----------------------------------------------------------------------------
# Develop
# ----------------------------------------------------------------------------

.PHONY: dev
dev: check-wails3 ## Run the desktop app with hot reload
	$(WAILS3) dev -config ./build/config.yml

.PHONY: dev-frontend
dev-frontend: ## Run only the UI in a browser with the mock backend (no Go)
	cd frontend && yarn dev

.PHONY: bindings
bindings: check-wails3 ## Regenerate the TypeScript bindings for the Go services
	$(WAILS3) generate bindings -clean=true -ts -i

.PHONY: icons
icons: check-wails3 ## Regenerate .ico/.icns from build/appicon.png
	$(WAILS3) task common:generate:icons

.PHONY: update-assets
update-assets: check-wails3 ## Regenerate platform build files from build/config.yml (overwrites edits)
	$(WAILS3) task common:update:build-assets

# ----------------------------------------------------------------------------
# Quality
# ----------------------------------------------------------------------------

.PHONY: test
test: embed-placeholder ## Run the Go tests
	go test .

.PHONY: vet
vet: embed-placeholder ## Run go vet and check gofmt
	go vet .
	@test -z "$$(gofmt -l *.go)" || { echo "gofmt needed on:"; gofmt -l *.go; exit 1; }

.PHONY: typecheck
typecheck: ## Type-check the frontend
	cd frontend && yarn typecheck

.PHONY: check
check: vet test typecheck ## Run every check (vet, Go tests, frontend types)

# ----------------------------------------------------------------------------
# Build
# ----------------------------------------------------------------------------

.PHONY: build
build: check-wails3 ## Production build for this machine -> bin/
	$(WAILS3) build

.PHONY: build-dev
build-dev: check-wails3 ## Debug build for this machine -> bin/
	$(WAILS3) build DEV=true

.PHONY: run
run: check-wails3 ## Run the last build from bin/
	$(WAILS3) task run

.PHONY: package
package: check-wails3 ## Package for this machine (AppImage/deb/rpm, NSIS installer, or .app). Use GOOS=<os> to target another OS
	$(WAILS3) package $(if $(GOOS),GOOS=$(GOOS)) $(if $(GOARCH),GOARCH=$(GOARCH))

# One build-<os>-<arch> target per entry in ALL_TARGETS, e.g. `make build-linux-amd64`.
define platform_rule
.PHONY: build-$(subst /,-,$(1))
build-$(subst /,-,$(1)): check-wails3
	$$(call build_one,$(word 1,$(subst /, ,$(1))),$(word 2,$(subst /, ,$(1))))
endef
$(foreach p,$(ALL_TARGETS),$(eval $(call platform_rule,$(p))))

# linux/arm64 needs a real arm64 toolchain (the cross image uses native gcc for
# Linux). On an arm64 Linux host that is just a normal build; anywhere else it
# runs inside an arm64 Docker container emulated with QEMU.
.PHONY: build-linux-arm64
ifneq (,$(filter aarch64 arm64,$(HOST_ARCH)))
build-linux-arm64: check-wails3
	$(call build_one,linux,arm64)
else
build-linux-arm64: check-wails3
	@command -v docker >/dev/null 2>&1 || { echo "Docker is required to build linux/arm64 on a non-arm64 machine."; exit 1; }
	@echo "==> Building linux/arm64 in an emulated arm64 container (slow: first run builds a ~25 min image)"
	$(WAILS3) task common:build:frontend
	docker run --privileged --rm tonistiigi/binfmt --install arm64
	@docker image inspect $(ARM64_IMAGE) >/dev/null 2>&1 || docker buildx build --platform linux/arm64 --load -t $(ARM64_IMAGE) -f build/docker/Dockerfile.cross build/docker/
	docker run --rm --platform linux/arm64 -v "$(CURDIR):/app" $$( $(WAILS3) tool docker-mounts | tr -d '"' ) -e APP_NAME="$(APP_NAME)" $(ARM64_IMAGE) linux arm64
	@docker run --rm -v "$(CURDIR):/app" alpine chown -R $$(id -u):$$(id -g) /app/bin
	@mkdir -p $(DIST_DIR)
	@mv -f $(BIN_DIR)/$(APP_NAME)-linux-arm64 $(DIST_DIR)/$(APP_NAME)-linux-arm64
	@echo "    -> $(DIST_DIR)/$(APP_NAME)-linux-arm64"
endif

.PHONY: build-windows build-linux build-darwin
build-windows: build-windows-amd64 build-windows-arm64 ## Build for Windows (amd64 + arm64)
build-linux: build-linux-amd64 build-linux-arm64 ## Build for Linux (amd64 + arm64)
build-darwin: build-darwin-arm64 build-darwin-amd64 ## Build for macOS (Apple silicon + Intel), Docker needed unless on a Mac

.PHONY: ensure-cross-image
ensure-cross-image: check-wails3
	@command -v docker >/dev/null 2>&1 || { echo "Docker is required to cross-compile Linux/macOS binaries (Windows needs none). Install it, or run: make build-all PLATFORMS=\"windows/amd64\""; exit 1; }
	@docker image inspect $(CROSS_IMAGE) >/dev/null 2>&1 || { echo "==> Building the $(CROSS_IMAGE) Docker image (one time)"; $(WAILS3) task setup:docker; }

.PHONY: build-all
build-all: check-wails3 $(if $(filter-out windows/%,$(PLATFORMS)),ensure-cross-image) ## Compile for every platform in PLATFORMS -> release/ (keeps going on failure)
	@failed=""; for p in $(PLATFORMS); do \
		$(MAKE) --no-print-directory build-$$(echo $$p | tr / -) || failed="$$failed $$p"; \
	done; \
	echo; echo "Built binaries in $(DIST_DIR)/:"; ls -1 $(DIST_DIR) 2>/dev/null; \
	if [ -n "$$failed" ]; then echo; echo "FAILED:$$failed"; exit 1; fi

# ----------------------------------------------------------------------------
# Clean
# ----------------------------------------------------------------------------

.PHONY: clean
clean: ## Remove build output (bin/, release/, frontend/dist, generated bindings)
	rm -rf $(BIN_DIR) $(DIST_DIR) frontend/dist frontend/bindings

.PHONY: distclean
distclean: clean ## clean + remove frontend/node_modules and the Task cache
	rm -rf frontend/node_modules .task