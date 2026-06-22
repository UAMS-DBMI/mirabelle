.PHONY: default check-tools tags clean

default: serve

# Minimum toolchain versions. Mirror these in package.json "engines" and
# .tool-versions. bun does NOT enforce "engines", so check-tools is what
# actually fails the build on a too-old bun/node.
BUN_MIN := 1.3.0
NODE_MIN := 22.0.0

# Backend env: development (localhost) | production (UAMS, default) | aries.
# Override per-invocation, e.g. `make serve ENV=aries`.
ENV ?= production

check-tools:
	@command -v bun >/dev/null 2>&1 || { echo "error: bun not found (need >= $(BUN_MIN))"; exit 1; }
	@v=$$(bun --version); \
	  [ "$$(printf '%s\n%s\n' "$(BUN_MIN)" "$$v" | sort -V | head -n1)" = "$(BUN_MIN)" ] \
	  || { echo "error: bun $$v is older than required $(BUN_MIN)"; exit 1; }
	@command -v node >/dev/null 2>&1 || { echo "error: node not found (need >= $(NODE_MIN))"; exit 1; }
	@v=$$(node --version | sed 's/^v//'); \
	  [ "$$(printf '%s\n%s\n' "$(NODE_MIN)" "$$v" | sort -V | head -n1)" = "$(NODE_MIN)" ] \
	  || { echo "error: node $$v is older than required $(NODE_MIN)"; exit 1; }

serve: node_modules
	bun --env-file=.env.$(ENV) run start

build: node_modules
	bun run build

node_modules: package.json bun.lock | check-tools
	# This is the same as `npm ci`
	bun install --frozen-lockfile

tags: 
	ctags -R --languages=JavaScript,TypeScript --exclude=node_modules --exclude=build --exclude=dist

clean:
	rm -rf node_modules dist
