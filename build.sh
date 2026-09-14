#!/bin/sh
# Rebuilds and reinstalls the extension. VS Code registers user extensions in
# ~/.vscode/extensions/extensions.json and ignores folders that are not listed
# there, so copying the sources into place by hand does nothing - it has to go
# through `code --install-extension`.
set -e
cd "$(dirname "$0")"
node extension/test.js
rm -f php-fold-imports-0.0.1.vsix
zip -q -r php-fold-imports-0.0.1.vsix '[Content_Types].xml' extension.vsixmanifest extension -x 'extension/test.js'
code --install-extension php-fold-imports-0.0.1.vsix --force
echo "Installed. Reload the VS Code window."
