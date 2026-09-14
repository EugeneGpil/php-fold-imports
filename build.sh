#!/bin/sh
# Rebuilds and reinstalls the extension. VS Code registers user extensions in
# ~/.vscode/extensions/extensions.json and ignores folders that are not listed
# there, so copying the sources into place by hand does nothing - it has to go
# through `code --install-extension`.
#
# --no-dependencies because there are no runtime deps and no node_modules for
# `npm list --production` to read.
set -e
cd "$(dirname "$0")"
node test.js
vsix="$(node -p 'const p=require("./package.json"); `${p.name}-${p.version}.vsix`')"
rm -f "$vsix"
npx --yes @vscode/vsce package --no-dependencies --out "$vsix"
npx --yes @vscode/vsce ls --no-dependencies
code --install-extension "$vsix" --force
echo "Installed. Reload the VS Code window."
