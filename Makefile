.PHONY: default tags clean

default: serve

# Backend env: development (localhost) | production (UAMS, default) | aries.
# Override per-invocation, e.g. `make serve ENV=aries`.
ENV ?= production

serve: node_modules
	bun --env-file=.env.$(ENV) run start

build: node_modules
	bun run build

node_modules: package.json bun.lock
	# This is the same as `npm ci`
	bun install --frozen-lockfile

tags: 
	ctags -R --languages=JavaScript,TypeScript --exclude=node_modules --exclude=build --exclude=dist

clean:
	rm -rf node_modules dist
