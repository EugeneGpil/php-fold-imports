'use strict';

const vscode = require('vscode');
const { computeFoldingRanges } = require('./folding');

const KINDS = {
    imports: vscode.FoldingRangeKind.Imports,
    comment: vscode.FoldingRangeKind.Comment,
    region: vscode.FoldingRangeKind.Region,
};

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    context.subscriptions.push(
        vscode.languages.registerFoldingRangeProvider(
            { language: 'php', scheme: '*' },
            {
                provideFoldingRanges(document) {
                    return computeFoldingRanges(document.getText())
                        .filter((range) => range.end > range.start && range.end < document.lineCount)
                        .map((range) => new vscode.FoldingRange(range.start, range.end, KINDS[range.kind]));
                },
            }
        )
    );
}

function deactivate() {}

module.exports = { activate, deactivate };
