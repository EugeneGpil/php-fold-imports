'use strict';

const assert = require('assert');
const { computeFoldingRanges } = require('./folding');

const imports = (text) => computeFoldingRanges(text).filter((range) => range.kind === 'imports');
const all = (text) => computeFoldingRanges(text);

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
