// marked's GFM table tokenizer splits every row on raw `|` BEFORE inline tokenization, so a pipe inside a
// code span (`` `x | y` ``) or a Go-template action (`{{.X | upper}}`) in a body cell creates a phantom
// column and the trailing cells are silently DROPPED on load. The splitter does honor `\|` — and unescapes
// it in the cell text — so pre-escaping those pipes before marked lexes protects the load side the same way
// TunedTable's renderChildren escape protects the save side.
//
// Scope is deliberately conservative — only rows that marked itself would treat as a table:
//   • the header/delimiter pair must already parse as a table (matching cell counts, delimiter has |/:) —
//     escaping pipes in a NON-table line would surface literal `\|` (and could even turn a setext heading
//     into a table by changing the header's cell count);
//   • only BODY rows starting with `|` are transformed (header cell counts are structural; a body row is
//     truncated/padded to the header width, so protecting its pipes only ever preserves more content);
//   • fenced code blocks are never touched.

const FENCE_LINE = /^ {0,3}(```|~~~)/;
const TABLE_DELIMITER_LINE = /^ {0,3}\|? *:?-+:? *(?:\| *:?-+:? *)*\|? *$/;
const BODY_ROW_LINE = /^ {0,3}\|/;
const TEMPLATE_ACTION = /\{\{[^{}]*\}\}/g;

const isEscapedAt = (text: string, offset: number): boolean => {
    let isEscaped = false;
    let index = offset;

    while (--index >= 0 && text[index] === '\\') {
        isEscaped = !isEscaped;
    }

    return isEscaped;
};

const escapeUnescapedPipes = (text: string): string =>
    text.replace(/\|/g, (pipe, offset: number, source: string) => (isEscapedAt(source, offset) ? pipe : '\\|'));

// Mirrors marked's splitCells: split on unescaped pipes, drop a blank leading/trailing cell.
const countCells = (row: string): number => {
    const cells = row
        .replace(/\|/g, (pipe, offset: number, source: string) => (isEscapedAt(source, offset) ? pipe : ' |'))
        .split(/ \|/);

    if (cells.length > 0 && !cells[0]!.trim()) {
        cells.shift();
    }

    if (cells.length > 0 && !cells.at(-1)!.trim()) {
        cells.pop();
    }

    return cells.length;
};

const findCodeSpanCloser = (row: string, from: number, runLength: number): number => {
    for (let index = from; index < row.length; index++) {
        if (row[index] !== '`') {
            continue;
        }

        let runEnd = index;

        while (runEnd < row.length && row[runEnd] === '`') {
            runEnd++;
        }

        if (runEnd - index === runLength) {
            return index;
        }

        index = runEnd - 1;
    }

    return -1;
};

const escapeRowPipes = (row: string): string => {
    let result = '';
    let index = 0;

    while (index < row.length) {
        const char = row[index]!;

        if (char !== '`') {
            result += char;
            index++;
            continue;
        }

        let runEnd = index;

        while (runEnd < row.length && row[runEnd] === '`') {
            runEnd++;
        }

        const run = row.slice(index, runEnd);
        const closerStart = findCodeSpanCloser(row, runEnd, run.length);

        // An unclosed backtick run is literal content, not a code span.
        if (closerStart < 0) {
            result += run;
            index = runEnd;
            continue;
        }

        result += run + escapeUnescapedPipes(row.slice(runEnd, closerStart)) + run;
        index = closerStart + run.length;
    }

    return result.replace(TEMPLATE_ACTION, (action) => escapeUnescapedPipes(action));
};

export const escapeTablePipes = (markdown: string): string => {
    if (!markdown.includes('|')) {
        return markdown;
    }

    const lines = markdown.split('\n');
    let openFence: null | string = null;
    let isChanged = false;

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index]!;
        const fence = FENCE_LINE.exec(line);

        if (fence) {
            openFence = openFence === fence[1] ? null : (openFence ?? fence[1]!);
            continue;
        }

        if (openFence !== null || !line.includes('|')) {
            continue;
        }

        const delimiter = lines[index + 1];

        if (
            delimiter === undefined ||
            !TABLE_DELIMITER_LINE.test(delimiter) ||
            !/[|:]/.test(delimiter) ||
            countCells(line) !== countCells(delimiter)
        ) {
            continue;
        }

        for (let row = index + 2; row < lines.length && BODY_ROW_LINE.test(lines[row]!); row++) {
            const escaped = escapeRowPipes(lines[row]!);

            if (escaped !== lines[row]) {
                lines[row] = escaped;
                isChanged = true;
            }
        }
    }

    return isChanged ? lines.join('\n') : markdown;
};
