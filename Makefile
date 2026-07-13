.PHONY: default check-tools tags clean build test

default: serve

# Minimum toolchain versions. Mirror these in package.json "engines" and
# .tool-versions. bun does NOT enforce "engines", so check-tools is what
# actually fails the build on a too-old bun/node.
BUN_MIN := 1.3.0

# Backend env: development (localhost) | production (UAMS, default) | aries.
# Override per-invocation, e.g. `make serve ENV=aries`.
ENV ?= production

# Every file under src/, so `dist` rebuilds when any source changes. Make's
# built-in $(wildcard) doesn't recurse, hence find.
SRC_FILES := $(shell find src -type f ! -name .DS_Store)

check-tools:
	@command -v bun >/dev/null 2>&1 || { echo "error: bun not found (need >= $(BUN_MIN))"; exit 1; }
	@v=$$(bun --version); \
	  [ "$$(printf '%s\n%s\n' "$(BUN_MIN)" "$$v" | sort -V | head -n1)" = "$(BUN_MIN)" ] \
	  || { echo "error: bun $$v is older than required $(BUN_MIN)"; exit 1; }

serve: node_modules
	bun --env-file=.env.$(ENV) run start

build: dist

test: node_modules
	bun run test

live-test: dist
	cd live-test && docker compose up

clean:
	rm -rf node_modules dist

## The real (non-phony) targets below here.
node_modules: package.json bun.lock | check-tools
	# This is the same as `npm ci`
	bun install --frozen-lockfile
	touch node_modules # make sure the target is updated even if bun install doesn't change anything

tags: 
	ctags -R --languages=JavaScript,TypeScript --exclude=node_modules --exclude=build --exclude=dist

dist: node_modules package.json bun.lock $(SRC_FILES)
	bun run build
	touch dist # make sure the target is updated even if bun run build doesn't change anything
