'use strict';

const assert = require('assert');
const { computeFoldingRanges } = require('./folding');

const imports = (text) => computeFoldingRanges(text).filter((range) => range.kind === 'imports');
const all = (text) => computeFoldingRanges(text);
const blocks = (text) => computeFoldingRanges(text).filter((range) => range.kind === null);
const regions = (text) => computeFoldingRanges(text).filter((range) => range.kind === 'region');

const cases = {
    'single use does not fold': () => {
        assert.deepStrictEqual(imports('<?php\n\nuse A\\B;\n\nclass X {}\n'), []);
    },
    'two uses fold as imports': () => {
        assert.deepStrictEqual(imports('<?php\n\nuse A\\B;\nuse C\\D;\n\nclass X {}\n'), [
            { start: 2, end: 3, kind: 'imports' },
        ]);
    },
    'declare and namespace before the block are excluded': () => {
        const text = '<?php\n\ndeclare(strict_types=1);\n\nnamespace App;\n\nuse A\\B;\nuse C\\D;\n';
        assert.deepStrictEqual(imports(text), [{ start: 6, end: 7, kind: 'imports' }]);
    },
    'grouped use spanning lines ends at its semicolon': () => {
        const text = '<?php\nuse A\\B;\nuse C\\{\n    D,\n    E,\n};\n\nclass X {}\n';
        assert.deepStrictEqual(imports(text), [{ start: 1, end: 5, kind: 'imports' }]);
        // No brace fold is emitted for the group braces.
        assert.deepStrictEqual(all(text).filter((range) => range.kind === null), []);
    },
    'closure capture is not an import': () => {
        const text = '<?php\nuse A\\B;\nuse C\\D;\n\n$f = function () use ($x) {\n    return $x;\n};\n';
        assert.deepStrictEqual(imports(text), [{ start: 1, end: 2, kind: 'imports' }]);
    },
    'trait use inside a class is not an import': () => {
        const text = '<?php\nuse A\\B;\nuse C\\D;\n\nclass X\n{\n    use SomeTrait;\n    use OtherTrait;\n}\n';
        assert.deepStrictEqual(imports(text), [{ start: 1, end: 2, kind: 'imports' }]);
    },
    'a statement between two use blocks splits them': () => {
        const text = '<?php\nuse A\\B;\nuse C\\D;\n\nconst X = 1;\n\nuse E\\F;\nuse G\\H;\n';
        assert.deepStrictEqual(imports(text), [
            { start: 1, end: 2, kind: 'imports' },
            { start: 6, end: 7, kind: 'imports' },
        ]);
    },
    'the word use inside a string is ignored': () => {
        const text = '<?php\n$sql = "use A\\B;\nuse C\\D;";\nclass X {}\n';
        assert.deepStrictEqual(imports(text), []);
    },
    'braces inside a heredoc do not shift depth': () => {
        const text = '<?php\nuse A\\B;\nuse C\\D;\n\n$s = <<<SQL\n    { not a block }\nSQL;\n\nclass X\n{\n    public $y = 1;\n}\n';
        assert.deepStrictEqual(imports(text), [{ start: 1, end: 2, kind: 'imports' }]);
        assert.deepStrictEqual(all(text).filter((range) => range.kind === null), [
            { start: 9, end: 10, kind: null },
        ]);
    },
    'attributes are not line comments': () => {
        const text = '<?php\nuse A\\B;\nuse C\\D;\n\n#[Attr]\nclass X\n{\n    public $y = 1;\n}\n';
        assert.deepStrictEqual(imports(text), [{ start: 1, end: 2, kind: 'imports' }]);
        assert.deepStrictEqual(all(text).filter((range) => range.kind === null), [
            { start: 6, end: 7, kind: null },
        ]);
    },
    'block comments fold as comments': () => {
        const text = '<?php\n\n/**\n * Doc.\n */\nclass X {}\n';
        assert.deepStrictEqual(all(text).filter((range) => range.kind === 'comment'), [
            { start: 2, end: 4, kind: 'comment' },
        ]);
    },
    'a docblock between uses keeps the block together': () => {
        const text = '<?php\nuse A\\B;\n/** note */\nuse C\\D;\n\nclass X {}\n';
        assert.deepStrictEqual(imports(text), [{ start: 1, end: 3, kind: 'imports' }]);
    },
    'method call named use is not an import': () => {
        const text = '<?php\nuse A\\B;\nuse C\\D;\n\n$builder->use($x);\n';
        assert.deepStrictEqual(imports(text), [{ start: 1, end: 2, kind: 'imports' }]);
    },
    'closing tag and inline html end the block': () => {
        const text = '<?php\nuse A\\B;\nuse C\\D;\n?>\n<div>{ not php }</div>\n<?php\nclass X\n{\n    public $y = 1;\n}\n';
        assert.deepStrictEqual(imports(text), [{ start: 1, end: 2, kind: 'imports' }]);
        assert.deepStrictEqual(all(text).filter((range) => range.kind === null), [
            { start: 7, end: 8, kind: null },
        ]);
    },
    'alternative if folds': () => {
        const text = '<?php\nif ($a):\n    echo 1;\nendif;\n';
        assert.deepStrictEqual(blocks(text), [{ start: 1, end: 2, kind: null }]);
    },
    'if elseif else endif yields three ranges': () => {
        const text =
            '<?php\nif ($a):\n    echo 1;\nelseif ($b):\n    echo 2;\nelse:\n    echo 3;\nendif;\n';
        assert.deepStrictEqual(blocks(text), [
            { start: 1, end: 2, kind: null },
            { start: 3, end: 4, kind: null },
            { start: 5, end: 6, kind: null },
        ]);
    },
    'alternative foreach nests inside an alternative if': () => {
        const text =
            '<?php\nif ($a):\n    foreach ($items as $item):\n        echo $item;\n    endforeach;\nendif;\n';
        assert.deepStrictEqual(blocks(text), [
            { start: 2, end: 3, kind: null },
            { start: 1, end: 4, kind: null },
        ]);
    },
    'alternative switch folds as one range': () => {
        const text =
            '<?php\nswitch ($a):\n    case 1:\n        echo 1;\n        break;\nendswitch;\n';
        assert.deepStrictEqual(blocks(text), [{ start: 1, end: 4, kind: null }]);
    },
    'semicolons inside the for parens do not break it': () => {
        const text = '<?php\nfor ($i = 0; ; ):\n    echo $i;\nendfor;\n';
        assert.deepStrictEqual(blocks(text), [{ start: 1, end: 2, kind: null }]);
    },
    'do while produces exactly one range from its braces': () => {
        const text = '<?php\ndo {\n    echo 1;\n} while ($x);\n';
        assert.deepStrictEqual(blocks(text), [{ start: 1, end: 2, kind: null }]);
    },
    'colons that do not open a block are ignored': () => {
        const text =
            '<?php\n$x = $a ? $b : $c;\nfunction f(): void {}\nf(cond: true);\nenum Suit: string {}\n';
        assert.deepStrictEqual(blocks(text), []);
    },
    'a template folds at every level across inline html': () => {
        const text = [
            '<?php if ($order->isPaid()): ?>',
            '    <p>Paid</p>',
            '<?php foreach ($items as $item): ?>',
            '    <li><?= $item->name ?></li>',
            '<?php endforeach; ?>',
            '<?php endif; ?>',
            '',
        ].join('\n');
        assert.deepStrictEqual(blocks(text), [
            { start: 2, end: 3, kind: null },
            { start: 0, end: 4, kind: null },
        ]);
    },
    'a condition spanning lines still opens the block': () => {
        const text =
            '<?php\nif (\n    $a\n    && $b\n):\n    echo 1;\nendif;\n';
        assert.deepStrictEqual(blocks(text), [{ start: 1, end: 5, kind: null }]);
    },
    'a closing paren inside a string does not end the condition': () => {
        const text = "<?php\nif ($a === ') :'):\n    echo 1;\nendif;\n";
        assert.deepStrictEqual(blocks(text), [{ start: 1, end: 2, kind: null }]);
    },
    'a method named endif is not a closer': () => {
        const text = '<?php\nif ($a):\n    $tpl->endif();\n    echo 1;\nendif;\n';
        assert.deepStrictEqual(blocks(text), [{ start: 1, end: 3, kind: null }]);
    },
    'keywords are matched case-insensitively': () => {
        const text = '<?php\nIF ($a):\n    echo 1;\nENDIF;\n';
        assert.deepStrictEqual(blocks(text), [{ start: 1, end: 2, kind: null }]);
    },
    'a region folds, swallowing its end marker': () => {
        const text = '<?php\n// #region Helpers\nfunction a() {}\nfunction b() {}\n// #endregion\n';
        assert.deepStrictEqual(regions(text), [{ start: 1, end: 4, kind: 'region' }]);
    },
    'nested regions produce two nested ranges': () => {
        const text =
            '<?php\n// #region Outer\n$a = 1;\n// #region Inner\n$b = 2;\n// #endregion\n$c = 3;\n// #endregion\n';
        assert.deepStrictEqual(regions(text), [
            { start: 3, end: 5, kind: 'region' },
            { start: 1, end: 7, kind: 'region' },
        ]);
    },
    'all three marker spellings fold': () => {
        const spellings = [
            ['#region', '#endregion'],
            ['//region', '//endregion'],
            ['// #region', '// #endregion'],
        ];
        for (const [start, end] of spellings) {
            const text = `<?php\n${start} Helpers\n$a = 1;\n${end}\n`;
            assert.deepStrictEqual(regions(text), [{ start: 1, end: 3, kind: 'region' }], start);
        }
    },
    'an attribute next to a hash region breaks neither': () => {
        const text =
            '<?php\n#[Attr]\nclass X\n{\n    #region Helpers\n    public function a() {}\n    #endregion\n}\n';
        assert.deepStrictEqual(regions(text), [{ start: 4, end: 6, kind: 'region' }]);
        assert.deepStrictEqual(blocks(text), [{ start: 3, end: 6, kind: null }]);
    },
    'an unmatched endregion emits nothing': () => {
        assert.deepStrictEqual(regions('<?php\n$a = 1;\n// #endregion\n$b = 2;\n'), []);
    },
    'an unclosed region emits nothing': () => {
        assert.deepStrictEqual(regions('<?php\n// #region Open\n$a = 1;\n$b = 2;\n'), []);
    },
    'markers inside a heredoc body are ignored': () => {
        const text =
            '<?php\n$s = <<<TXT\n// #region Fake\n    body\n// #endregion\nTXT;\n\n// #region Real\n$a = 1;\n// #endregion\n';
        assert.deepStrictEqual(regions(text), [{ start: 7, end: 9, kind: 'region' }]);
    },
};

let failed = 0;
for (const [name, run] of Object.entries(cases)) {
    try {
        run();
        console.log(`  ok   ${name}`);
    } catch (error) {
        failed++;
        console.log(`  FAIL ${name}\n       ${error.message.replace(/\n/g, '\n       ')}`);
    }
}
console.log(`\n${Object.keys(cases).length - failed}/${Object.keys(cases).length} passed`);
process.exit(failed === 0 ? 0 : 1);
