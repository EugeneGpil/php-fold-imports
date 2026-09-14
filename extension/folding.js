'use strict';

const IDENTIFIER_CHAR = /[A-Za-z0-9_\u0080-\uffff]/;
const IDENTIFIER_START = '[A-Za-z_\\u0080-\\uffff][A-Za-z0-9_\\u0080-\\uffff]*';
const HEREDOC_HEADER = new RegExp(
    `^<<<[ \\t]*(?:'(${IDENTIFIER_START})'|"(${IDENTIFIER_START})"|(${IDENTIFIER_START}))[ \\t]*\\r?\\n`
);
const MEMBER_ACCESS = /(->|\?->|::)[ \t\r\n]*$/;

// PHP's alternative syntax - `if (...): ... endif;` - carries no braces, so it needs a
// stack of its own next to the brace stack. The two nest independently.
const ALTERNATIVE_OPENERS = new Set([
    'if', 'elseif', 'else', 'for', 'foreach', 'while', 'switch', 'declare',
]);
const ALTERNATIVE_CLOSERS = new Set([
    'endif', 'endfor', 'endforeach', 'endwhile', 'endswitch', 'enddeclare',
]);
// A gate cheap enough to run on every identifier: a generated file can hold hundreds of
// thousands of them, and lowercasing each one to miss both sets costs real time. `| 0x20`
// folds an ASCII letter to lower case and leaves digits where they are.
const ALTERNATIVE_FIRST_CODES = new Set(
    ['d', 'e', 'f', 'i', 's', 'w'].map((char) => char.charCodeAt(0))
);

/**
 * Folding ranges for PHP source, computed from a single character scan.
 *
 * The point of the exercise is the `imports` range over the top-level `use`
 * block: `editor.foldingImportsByDefault` collapses exactly that kind on open,
 * and nothing else here produces it - Intelephense gates its folding provider
 * behind a Premium licence, and the editor's indentation fallback emits no
 * kinds at all. Registering any provider for PHP switches that fallback off,
 * so the ordinary blocks and block comments have to be produced here too.
 *
 * Returns plain objects so this file stays testable outside VS Code.
 *
 * @param {string} text
 * @returns {{start: number, end: number, kind: ('imports'|'comment'|null)}[]}
 */
function computeFoldingRanges(text) {
    const ranges = [];
    const stack = [];
    const alternativeStack = [];
    const length = text.length;

    let index = 0;
    let line = 0;
    let isInPhp = false;
    let isInUseStatement = false;
    let useStatementLine = 0;
    let importsStart = null;
    let importsEnd = null;

    const flushImports = () => {
        if (importsStart !== null && importsEnd > importsStart) {
            ranges.push({ start: importsStart, end: importsEnd, kind: 'imports' });
        }
        importsStart = null;
        importsEnd = null;
    };

    // True once a `use` statement has closed and nothing but trivia has followed:
    // the next significant character decides whether the block keeps growing.
    const isAwaitingNextImport = () => importsStart !== null && !isInUseStatement;

    const isIdentifierChar = (char) => char !== undefined && IDENTIFIER_CHAR.test(char);

    const advanceTo = (offset) => {
        const stop = Math.min(offset, length);
        for (let at = index; at < stop; at++) {
            if (text[at] === '\n') {
                line++;
            }
        }
        index = stop;
    };

    // Stops *at* the newline or `?>` rather than past it: the main loop handles both.
    const findLineEnd = (from) => {
        let at = from;
        while (at < length && text[at] !== '\n') {
            if (text[at] === '?' && text[at + 1] === '>') {
                break;
            }
            at++;
        }
        return at;
    };

    const skipToLineEnd = () => {
        index = findLineEnd(index);
    };

    const skipTrivia = (from) => {
        let at = from;
        while (at < length) {
            const char = text[at];
            if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
                at++;
                continue;
            }
            if (char === '/' && text[at + 1] === '/') {
                at = findLineEnd(at);
                continue;
            }
            if (char === '#' && text[at + 1] !== '[') {
                at = findLineEnd(at);
                continue;
            }
            if (char === '/' && text[at + 1] === '*') {
                const close = text.indexOf('*/', at + 2);
                at = close === -1 ? length : close + 2;
                continue;
            }
            break;
        }
        return at;
    };

    // `from` must sit on `(`. Returns the offset just past the matching `)`, or -1.
    const findParenEnd = (from) => {
        let depth = 0;
        let at = from;
        while (at < length) {
            const skipped = skipTrivia(at);
            if (skipped > at) {
                at = skipped;
                continue;
            }
            const char = text[at];
            if (char === "'" || char === '"' || char === '`') {
                at++;
                while (at < length) {
                    if (text[at] === '\\') {
                        at += 2;
                        continue;
                    }
                    if (text[at] === char) {
                        at++;
                        break;
                    }
                    at++;
                }
                continue;
            }
            if (char === '(') {
                depth++;
            } else if (char === ')') {
                depth--;
                if (depth === 0) {
                    return at + 1;
                }
            }
            at++;
        }
        return -1;
    };

    // Lookahead only - the scanner is left on the keyword so the condition, and any braces
    // or strings inside it, still go through the main loop.
    const startsAlternativeBlock = (word, after) => {
        let cursor = skipTrivia(after);
        if (word !== 'else') {
            if (text[cursor] !== '(') {
                return false;
            }
            cursor = findParenEnd(cursor);
            if (cursor === -1) {
                return false;
            }
            cursor = skipTrivia(cursor);
        }
        return text[cursor] === ':' && text[cursor + 1] !== ':';
    };

    const closeAlternativeBlock = () => {
        const open = alternativeStack.pop();
        if (open !== undefined && line > open.line) {
            ranges.push({ start: open.line, end: line - 1, kind: null });
        }
    };

    while (index < length) {
        const char = text[index];

        if (char === '\n') {
            line++;
            index++;
            continue;
        }

        if (!isInPhp) {
            if (char === '<' && text[index + 1] === '?') {
                isInPhp = true;
                if (text.startsWith('<?php', index)) {
                    index += 5;
                } else if (text.startsWith('<?=', index)) {
                    index += 3;
                } else {
                    index += 2;
                }
                continue;
            }
            index++;
            continue;
        }

        if (char === '?' && text[index + 1] === '>') {
            isInPhp = false;
            isInUseStatement = false;
            flushImports();
            index += 2;
            continue;
        }

        if (char === '/' && text[index + 1] === '/') {
            skipToLineEnd();
            continue;
        }

        // `#[` opens an attribute, everything else on a `#` is a line comment.
        if (char === '#') {
            if (text[index + 1] === '[') {
                index += 2;
                continue;
            }
            skipToLineEnd();
            continue;
        }

        if (char === '/' && text[index + 1] === '*') {
            const startLine = line;
            const close = text.indexOf('*/', index + 2);
            advanceTo(close === -1 ? length : close + 2);
            if (line > startLine) {
                ranges.push({ start: startLine, end: line, kind: 'comment' });
            }
            continue;
        }

        if (char === "'" || char === '"' || char === '`') {
            let at = index + 1;
            while (at < length) {
                if (text[at] === '\\') {
                    at += 2;
                    continue;
                }
                if (text[at] === char) {
                    at++;
                    break;
                }
                at++;
            }
            advanceTo(at);
            continue;
        }

        if (char === '<' && text.startsWith('<<<', index)) {
            const header = HEREDOC_HEADER.exec(text.slice(index, index + 256));
            if (header !== null) {
                const label = header[1] || header[2] || header[3];
                const bodyStart = index + header[0].length;
                const terminator = new RegExp(
                    `^[ \\t]*${label}(?![A-Za-z0-9_\\u0080-\\uffff])`,
                    'm'
                );
                const found = terminator.exec(text.slice(bodyStart));
                advanceTo(found === null ? length : bodyStart + found.index + found[0].length);
                continue;
            }
        }

        if (isIdentifierChar(char) && !isIdentifierChar(text[index - 1]) && text[index - 1] !== '$') {
            let at = index;
            while (at < length && isIdentifierChar(text[at])) {
                at++;
            }
            const word = text.slice(index, at);
            const isMemberAccess = MEMBER_ACCESS.test(text.slice(Math.max(0, index - 32), index));

            if (word === 'use' && stack.length === 0 && !isInUseStatement && !isMemberAccess) {
                // A closure's `use ($captured)` also sits at brace depth zero.
                const rest = text.slice(at, at + 64).replace(/^[ \t\r\n]*/, '');
                if (!rest.startsWith('(')) {
                    isInUseStatement = true;
                    useStatementLine = line;
                    index = at;
                    continue;
                }
            }

            if (isAwaitingNextImport()) {
                flushImports();
            }

            const mayBeKeyword =
                !isMemberAccess && ALTERNATIVE_FIRST_CODES.has(text.charCodeAt(index) | 0x20);
            const keyword = mayBeKeyword ? word.toLowerCase() : '';
            if (ALTERNATIVE_CLOSERS.has(keyword)) {
                closeAlternativeBlock();
            } else if (ALTERNATIVE_OPENERS.has(keyword) && startsAlternativeBlock(keyword, at)) {
                // `elseif` and `else` end the branch above them before opening their own,
                // the way `if {…} else {…}` gives two separate brace folds.
                if (keyword === 'elseif' || keyword === 'else') {
                    closeAlternativeBlock();
                }
                alternativeStack.push({ line });
            }

            index = at;
            continue;
        }

        if (char === ';' && stack.length === 0 && isInUseStatement) {
            isInUseStatement = false;
            if (importsStart === null) {
                importsStart = useStatementLine;
            }
            importsEnd = line;
            index++;
            continue;
        }

        if (char === '{' || char === '[') {
            if (isAwaitingNextImport()) {
                flushImports();
            }
            stack.push({ line, isInUseStatement });
            index++;
            continue;
        }

        if (char === '}' || char === ']') {
            const open = stack.pop();
            if (open !== undefined && line > open.line && !open.isInUseStatement) {
                ranges.push({ start: open.line, end: line - 1, kind: null });
            }
            index++;
            continue;
        }

        if (isAwaitingNextImport() && !/\s/.test(char)) {
            flushImports();
        }
        index++;
    }

    flushImports();

    return ranges;
}

module.exports = { computeFoldingRanges };
