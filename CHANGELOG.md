# Changelog

All notable changes to this extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-09-15

First release.

### Added

- A folding range over the top-level `use` block, tagged `Imports`, so that
  `"editor.foldingImportsByDefault": true` collapses it when a PHP file opens. Consecutive
  `use` declarations merge into one range; the range is only emitted when it spans more than
  one line.
- Folding for `{ … }` and `[ … ]` blocks — classes, functions, control flow, array literals.
  Registering any folding provider disables VS Code's indentation fallback, so these have to
  be provided or they would be lost.
- Folding for PHP's alternative syntax — `if (…): … endif;` and the same for `for`,
  `foreach`, `while`, `switch` and `declare`, with each `elseif`/`else` branch of a chain
  folding on its own. An opener is only recognised once its keyword is followed by a
  parenthesised condition and a `:`, which keeps ternaries, return types, named arguments
  and enum backing types out of it.
- Folding for `#region … #endregion` markers, tagged `Region`, so "Fold All Regions" works.
  All three spellings from VS Code's own PHP language configuration are matched — `#region`,
  `//region` and `// #region` — and the range includes the `#endregion` line, matching VS
  Code's marker provider.
- Folding for multi-line `/* … */` and `/** … */` comments, tagged `Comment`.

### Notes

Ranges come from a single left-to-right scan with no syntax tree. The scanner tracks strings,
heredoc and nowdoc bodies, line and block comments, `#[Attributes]`, and `?>` … `<?php` with
inline HTML between, so a `use` or a `#region` inside any of those is text rather than
syntax. It only registers for the `php` language — `.blade.php` files are untouched.
