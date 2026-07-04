import { describe, expect, it } from 'vitest';

import { escapeTablePipes } from './markdown-editor-table-pipes';
import { roundTrip, setupEditorJsdom } from './markdown-editor-test-setup';

setupEditorJsdom();

describe('escapeTablePipes — pure pre-lex pipe protection', () => {
    it('escapes a pipe inside a code span in a body row', () => {
        expect(escapeTablePipes('| Op | Meaning |\n| --- | --- |\n| `x | y` | z |')).toBe(
            '| Op | Meaning |\n| --- | --- |\n| `x \\| y` | z |',
        );
    });

    it('escapes a pipe inside a Go-template action in a body row', () => {
        expect(escapeTablePipes('| Var | Out |\n| --- | --- |\n| {{.X | upper}} | ok |')).toBe(
            '| Var | Out |\n| --- | --- |\n| {{.X \\| upper}} | ok |',
        );
    });

    it('leaves a plain-text pipe (real column delimiter) untouched', () => {
        const table = '| a | b |\n| --- | --- |\n| 1 | 2 |';

        expect(escapeTablePipes(table)).toBe(table);
    });

    it('does not double-escape an already-escaped pipe', () => {
        const table = '| a | b |\n| --- | --- |\n| `x \\| y` | z |';

        expect(escapeTablePipes(table)).toBe(table);
    });

    it('handles a multi-backtick code span', () => {
        expect(escapeTablePipes('| a | b |\n| --- | --- |\n| ``x | y`` | z |')).toBe(
            '| a | b |\n| --- | --- |\n| ``x \\| y`` | z |',
        );
    });

    it('leaves an unclosed backtick run alone (not a code span)', () => {
        const table = '| a | b |\n| --- | --- |\n| `x | y |';

        expect(escapeTablePipes(table)).toBe(table);
    });

    it('never touches a fenced code block that happens to hold a table', () => {
        const doc = '```\n| a | b |\n| --- | --- |\n| `x | y` | z |\n```';

        expect(escapeTablePipes(doc)).toBe(doc);
    });

    it('ignores a non-table line whose text contains pipes in code', () => {
        const prose = 'run `a | b` in the shell';

        expect(escapeTablePipes(prose)).toBe(prose);
    });

    it('returns the input unchanged when there is no pipe at all', () => {
        const doc = '# heading\n\nsome `code` here';

        expect(escapeTablePipes(doc)).toBe(doc);
    });
});

describe('table cell with a piped code span — content survives load and converges (H1)', () => {
    it('keeps the trailing cell and preserves the code content', () => {
        const out = roundTrip('| Op | Meaning |\n| --- | --- |\n| `x | y` | z |');

        expect(out).toContain('z');
        expect(out).toContain('`x \\| y`');
        expect(roundTrip(out)).toBe(out);
    });

    it('keeps a Go-template action with a pipe inside a cell', () => {
        const out = roundTrip('| Var | Out |\n| --- | --- |\n| {{.X | upper}} | done |');

        expect(out).toContain('done');
        expect(out).toContain('{{.X \\| upper}}');
        expect(roundTrip(out)).toBe(out);
    });
});
