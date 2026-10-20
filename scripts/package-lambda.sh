#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.aws-sam/lambda-bundle"
rm -rf "$OUT"
mkdir -p "$OUT/dist"

cd "$ROOT"
npm run build -w @accountabilabuddy/shared
npm run build -w @accountabilabuddy/api

cp -R "$ROOT/apps/api/dist/"* "$OUT/dist/"
cp "$ROOT/apps/api/package.json" "$OUT/"

# Pack shared workspace dependency as a local tarball for Lambda
cd "$OUT"
npm pack "$ROOT/packages/shared" >/dev/null
SHARED_TGZ="$(ls accountabilabuddy-shared-*.tgz | head -1)"
node -e "
const fs=require('fs');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
pkg.dependencies=pkg.dependencies||{};
pkg.dependencies['@accountabilabuddy/shared']='file:./${SHARED_TGZ}';
delete pkg.devDependencies;
delete pkg.scripts;
fs.writeFileSync('package.json', JSON.stringify(pkg,null,2));
"
npm install --omit=dev --ignore-scripts
echo "Lambda bundle ready at $OUT"
du -sh "$OUT"
