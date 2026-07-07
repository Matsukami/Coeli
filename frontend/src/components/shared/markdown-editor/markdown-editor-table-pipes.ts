// marked's GFM table tokenizer splits every row on raw `|` BEFORE inline tokenization, so a pipe inside a
// code span (`` `x | y` ``), a Go-template action (`{{.X | upper}}`), or a URL (`[x](http://a|b)`, a bare
// `http://a|b`, an image src) in a cell creates a phantom column and the trailing cells are silently DROPPED
// on load. The splitter does honor `\|` — and unescapes it in the cell text — so pre-escaping those pipes
// before marked lexes protects the load side the same way TunedTable's renderChildren escape protects save.
//
// Scope must match EXACTLY the rows marked itself treats as the table — no more, no less:
//   • the header/delimiter pair must already parse as a table (matching cell counts, delimiter has |/:) —
//     escaping pipes in a NON-table line would surface a literal `\|` (the escape tokenizer is neutralised,
//     so `\|` outside a real table row does NOT unescape) and could even turn a setext heading into a table;
//   • the leading/trailing pipe is OPTIONAL in GFM, so the header row AND every body row are transformed
//     (marked's own gfmTable body capture — `(?!blank|hr|heading|blockquote|code|fences|list).*` — has no
//     leading-pipe requirement; gating on a leading `|` dropped cells for the common no-outer-pipe style);
//   • a table's rows run until a blank line or the start of another block (mirrored by ENDS_TABLE_BODY);
//   • fenced code blocks are never touched.
// Not covered: an HTML-block line (a standard block tag) immediately following a table with no blank line —
// marked would end the table there; we do not replicate its HTML-block interrupt (vanishingly rare in this
// content, and our html tokenizers render such lines as literal text anyway).

// Capture the full fence run (not a fixed 3) plus the trailing text: renderTunedCodeBlock widens a fence to
// 4+ backticks when its content holds a ``` line, and CommonMark closes a fence only with a run of the same
// char, length >= the opener, and no info string — so length- and char-aware tracking is load-bearing.
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
// Written to be linear: the trailing `(?: *\|)? *$` (not `\|? *$`) plus per-cell spacing keep any two space
// runs from competing for the same characters, so a crafted delimiter-looking line can't force O(n²) backtracking.
const TABLE_DELIMITER_LINE = /^ {0,3}\|? *:?-+:?(?: *\| *:?-+:?)*(?: *\|)? *$/;
const TEMPLATE_ACTION = /\{\{[^{}]*\}\}/g;
// A maximal non-space run containing a `scheme://` — a link/image destination or a bare autolink. It has no
// spaces by construction, so any `|` in it is URL content (never a real cell separator, which needs spaces
// around it or sits outside the run), and escaping it is always correct.
const URL_RUN = /[^\s]*:\/\/[^\s]*/g;

// A table's body ends at a blank line or the first line that starts a different block — the same interrupts
// marked's gfmTable body-row negative lookahead lists (heading, blockquote, fences, list, hr, indented code).
const ENDS_TABLE_BODY = [
    /^[ \t]*$/,
    FENCE_LINE,
    /^ {0,3}#{1,6}(?: |\t|$)/,
    /^ {0,3}>/,
    /^ {0,3}(?:[*+-]|1[.)])[ \t]/,
    /^ {0,3}(?:(?:- *){3,}|(?:_ *){3,}|(?:\* *){3,})$/,
    /^(?: {4}| {0,3}\t)/,
];

const isTableBodyEnd = (line: string): boolean => ENDS_TABLE_BODY.some((rule) => rule.test(line));

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

    return result
        .replace(TEMPLATE_ACTION, (action) => escapeUnescapedPipes(action))
        .replace(URL_RUN, (url) => escapeUnescapedPipes(url));
};

export const escapeTablePipes = (markdown: string): string => {
    if (!markdown.includes('|')) {
        return markdown;
    }

    // marked normalizes CRLF itself, but this pre-pass runs BEFORE it: a trailing `\r` left by split('\n')
    // defeats the `$`-anchored TABLE_DELIMITER_LINE, so a CRLF document's tables would go unprotected here and
    // lose cells. Normalize first; the return below keeps the original bytes when nothing was escaped.
    const source = markdown.includes('\r') ? markdown.replace(/\r\n?/g, '\n') : markdown;
    const lines = source.split('\n');
    let openFence: null | { char: string; length: number } = null;
    let isChanged = false;

    const escapeRow = (row: number): void => {
        const escaped = escapeRowPipes(lines[row]!);

        if (escaped !== lines[row]) {
            lines[row] = escaped;
            isChanged = true;
        }
    };

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index]!;
        const fence = FENCE_LINE.exec(line);

        if (fence) {
            const marker = fence[1]!;

            if (openFence === null) {
                openFence = { char: marker[0]!, length: marker.length };
            } else if (marker[0] === openFence.char && marker.length >= openFence.length && !fence[2]!.trim()) {
                openFence = null;
            }

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

        // Header + every body row up to the block boundary; the delimiter row (index + 1) holds no cell
        // content. escapeRowPipes leaves structural pipes alone, so escaping the header can't skew its cell count.
        escapeRow(index);

        for (let row = index + 2; row < lines.length && !isTableBodyEnd(lines[row]!); row++) {
            escapeRow(row);
        }
    }

    return isChanged ? lines.join('\n') : markdown;
};
