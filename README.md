# PHP Fold Imports

[![test](https://github.com/EugeneGpil/php-fold-imports/actions/workflows/test.yml/badge.svg)](https://github.com/EugeneGpil/php-fold-imports/actions/workflows/test.yml)

Folding ranges for PHP, with the `use` block tagged as an **imports** range — so VS Code
collapses it the moment a file opens.

```php
<?php

namespace App\Http\Controllers;

use App\Models\Order;      ⌄        use App\Models\Order;  ⌄  ⋯
use App\Models\Product;           →
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

final class OrderController
```

## Why this exists

VS Code has a setting for exactly this:

```jsonc
"editor.foldingImportsByDefault": true
```

It does nothing in PHP files for most people, and the reason is not obvious. The setting
collapses folding ranges whose kind is `FoldingRangeKind.Imports`, and in a stock PHP setup
no such range is ever produced:

- **Intelephense** implements it — it walks the consecutive `use` declarations and emits a
  range tagged `Imports` — but folding is one of its **Premium** features. Without a licence
  key the language server reports `foldingRangeProvider: false` and contributes no folding
  at all.
- With no folding provider registered, VS Code falls back to its own **indentation-based**
  folding. That produces perfectly good ranges for indented blocks, but it tags none of them
  with a kind, so `foldingImportsByDefault` has nothing to act on. A top-level `use` block
  isn't indented anyway.

The failure is silent: no error, no log entry, the setting simply has no effect.

This extension is an independent implementation of the folding ranges — it does not modify,
patch, or work around Intelephense in any way. If you own an Intelephense licence you do not
need it: uninstall this and the same setting starts working off Intelephense's own provider,
which is more accurate because it comes from a real parser.

## What it provides

Three kinds of folding range, from a single scan of the file:

| Range | Kind | Notes |
|---|---|---|
| The top-level `use` block | `Imports` | Only when it spans more than one line. This is what `foldingImportsByDefault` collapses. |
| `{ … }` and `[ … ]` blocks | — | Classes, functions, control flow, array literals. |
| `if (…): … endif;` blocks | — | PHP's alternative syntax, including `elseif`/`else` branches. |
| `/* … */` and `/** … */` | `Comment` | Multi-line only. |

The last two are not a bonus feature. Registering *any* folding provider for a language turns
off VS Code's indentation fallback, so an extension that contributed only the imports range
would take class and function folding away with one hand while giving you the import fold with
the other.

The scanner understands PHP well enough not to be fooled by the usual traps: single- and
double-quoted strings, heredoc and nowdoc bodies, line and block comments, `#[Attributes]`
(which are not `#` comments), `?>` … `<?php` with inline HTML in between, a closure's
`use ($captured)` capture list, a `use SomeTrait;` inside a class body, a grouped
`use App\{A, B};` spread over several lines, and a method call that happens to be named
`use()`. On the alternative-syntax side it tells a block-opening `:` apart from a ternary,
a return type, a named argument and an enum backing type.

## Requirements

VS Code 1.80 or newer. No dependencies, no language server, no configuration files.

## Install

From a `.vsix`:

```sh
code --install-extension php-fold-imports-0.0.1.vsix
```

Copying the extension folder into `~/.vscode/extensions/` by hand does **not** work on current
VS Code — user extensions are registered in `~/.vscode/extensions/extensions.json`, and a
folder that isn't listed there is ignored. `code --list-extensions` is the check: if the
extension isn't in that output, it isn't loaded.

## Configuration

The extension itself has no settings. It exists to feed one built-in setting, which you have
to turn on yourself:

```jsonc
{
    "editor.foldingImportsByDefault": true
}
```

There is no synthesized `import …;` placeholder line the way some IDEs do it. The block folds
into its own first line with a chevron; `Ctrl+K Ctrl+J` unfolds everything in the file.

## Limitations

One of these is a thing you *lose*, so it is worth reading before you install:

- **`#region` / `#endregion` markers stop working.** VS Code implements them inside the same
  indentation-based provider that this extension displaces.
- **Blade is untouched.** `.blade.php` files are usually mapped to the `blade` language, and
  this extension only registers for `php`. A `@php use …; @endphp` header will not fold.
- **It is a scanner, not a parser.** It has no syntax tree and no symbol table. It is fast and
  it degrades gracefully, but a sufficiently strange file will get a folding range in a
  slightly strange place.

## How it works

`folding.js` is a single left-to-right pass over the file text, tracking a brace stack, the
current line, and whether it is inside PHP, a string, a heredoc, or a comment. A `use` at
brace depth zero that is not followed by `(` starts an import statement; consecutive import
statements are merged into one range, and anything else at depth zero closes it.

Alternative syntax — `if (…): … endif;` and friends — has a second stack beside the brace
one, since the two nest independently. An opener only counts when its keyword is followed by
a parenthesised condition and then a `:`, which is what keeps ternaries, return types, named
arguments and enum backing types out of it. `elseif` and `else` close the branch above them
before opening their own, so a chain folds branch by branch the way `if {…} else {…}` does.

It has no dependency on the `vscode` module, which is what makes it testable as plain Node —
`extension.js` is a thin adapter that turns its output into `vscode.FoldingRange` objects.

## Development

```sh
node extension/test.js   # unit tests, no dependencies
./build.sh               # test, pack the vsix, reinstall, then reload the window
```

Every push and pull request runs the same suite on GitHub Actions
([`.github/workflows/test.yml`](.github/workflows/test.yml)), preceded by a `node --check` of
the two files that ship.

`extension/test.js` covers the edge cases listed above. The scanner has also been run over
~8,700 files of a large private Laravel codebase with no crashes and no out-of-bounds ranges;
the slowest file was a 4 MB generated array at ~100 ms. Alternative syntax was checked
separately against 500 real templates that use it, which produced 1,617 folds and changed no
range the brace scanner had already found.

## License

MIT — see [extension/LICENSE.txt](extension/LICENSE.txt).
