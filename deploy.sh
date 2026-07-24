#!/usr/bin/env bash
# Builds the app and zips dist/automata-lab/browser for Cloudflare Pages
# direct upload. See DEPLOYMENT.md.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

BROWSER_DIR="dist/automata-lab/browser"
ZIP_FILE="automata-lab.zip"

echo "Building..."
npm run build

if [ ! -f "$BROWSER_DIR/index.html" ]; then
  echo "error: $BROWSER_DIR/index.html not found after build" >&2
  exit 1
fi

echo "Zipping $BROWSER_DIR -> $ZIP_FILE"
rm -f "$ZIP_FILE"
python3 -c "
import os, zipfile
src = '$BROWSER_DIR'
with zipfile.ZipFile('$ZIP_FILE', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, _, files in os.walk(src):
        for f in files:
            path = os.path.join(root, f)
            zf.write(path, os.path.relpath(path, src))
"

echo "Done: $ZIP_FILE ($(du -h "$ZIP_FILE" | cut -f1))"
echo "Upload it at: Cloudflare dashboard -> Workers & Pages -> automata-lab -> Create deployment -> Upload assets"
