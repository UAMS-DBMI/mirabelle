.PHONY: default tags clean

default: serve

serve: node_modules
	npm run start

build: node_modules
	npm run build

node_modules: package.json
	npm i

tags: 
	ctags -R --languages=JavaScript,TypeScript --exclude=node_modules --exclude=build --exclude=dist

clean:
	rm -rf node_modules dist
