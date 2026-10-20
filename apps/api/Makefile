# Used by `sam build` (Metadata BuildMethod: makefile).
# ARTIFACTS_DIR is provided by SAM.
build-ApiFunction build-NotificationFunction:
	cd ../.. && npm ci --ignore-scripts
	cd ../.. && npm run build -w @accountabilabuddy/shared
	cd ../.. && npm run build -w @accountabilabuddy/api
	mkdir -p "$(ARTIFACTS_DIR)/dist"
	cp -R dist/* "$(ARTIFACTS_DIR)/dist/"
	cp package.json "$(ARTIFACTS_DIR)/"
	# Install production deps into the artifact (includes workspace shared via file path rewrite)
	cd "$(ARTIFACTS_DIR)" && npm pack ../../packages/shared >/dev/null \
	  && SHARED_TGZ=$$(ls accountabilabuddy-shared-*.tgz | head -1) \
	  && npm pkg set 'dependencies.@accountabilabuddy/shared=file:./'"$$SHARED_TGZ" \
	  && npm install --omit=dev --ignore-scripts
