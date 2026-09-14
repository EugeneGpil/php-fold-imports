'use strict';

const IDENTIFIER_CHAR = /[A-Za-z0-9_\u0080-\uffff]/;
const IDENTIFIER_START = '[A-Za-z_\\u0080-\\uffff][A-Za-z0-9_\\u0080-\\uffff]*';
const HEREDOC_HEADER = new RegExp(
    `^<<<[ \\t]*(?:'(${IDENTIFIER_START})'|"(${IDENTIFIER_START})"|(${IDENTIFIER_START}))[ \\t]*\\r?\\n`
);
const MEMBER_ACCESS = /(->|\?->|::)[ \t\r\n]*$/;

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

    const skipToLineEnd = () => {
        let at = index;
        while (at < length && text[at] !== '\n') {
            if (text[at] === '?' && text[at + 1] === '>') {
                break;
            }
            at++;
        }
        index = at;
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
