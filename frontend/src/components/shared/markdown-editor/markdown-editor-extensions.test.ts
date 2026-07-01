import { Editor } from '@tiptap/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { findVariableOccurrences } from './editor-variable-highlight';
import { createMarkdownExtensions } from './markdown-editor-extensions';

beforeAll(() => {
    document.elementFromPoint = () => null;
    const r = { bottom: 0, height: 0, left: 0, right: 0, toJSON: () => ({}), top: 0, width: 0, x: 0, y: 0 };
    Range.prototype.getBoundingClientRect = () => r as DOMRect;
    Range.prototype.getClientRects = () =>
        ({ item: () => null, length: 0, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
});

const roundTrip = (content: string): string => {
    const editor = new Editor({ content, contentType: 'markdown', extensions: createMarkdownExtensions() });
    const out = editor.getMarkdown();
    editor.destroy();

    return out;
};

const words = (s: string): string[] => s.match(/[\p{L}\p{N}]+/gu) ?? [];
const sameWords = (a: string, b: string) => expect(words(b).sort()).toEqual(words(a).sort());

describe('literal <tags> survive (marked HTML-tokenizers neutralized + no entity-encode)', () => {
    it.each([
        '<container_environment>',
        '</language_policy>',
        '<specialist name="searcher">',
        // void HTML elements: marked would SWALLOW these without the neutralized html/tag tokenizers.
        '<input>',
        '<br>',
    ])('keeps %s verbatim (no &lt;, no swallow)', (tag) => {
        const out = roundTrip('lead ' + tag + ' tail');

        expect(out).toContain(tag);
        expect(out).not.toContain('&lt;');
        expect(out).not.toContain('&gt;');
    });
});

describe('Go-template variables survive verbatim', () => {
    it.each(['{{.Var}}', '{{- if .X}}', '{{range .Items}}', '{{.X | upper}}', '{{printf "%d" .N}}', '{{- .Both -}}'])(
        'keeps %s',
        (v) => {
            expect(roundTrip('lead ' + v + ' tail')).toContain(v);
        },
    );
});

describe('selective escape — no stray backslashes on literal punctuation', () => {
    it.each(['Scan ports [1-1000].', 'run nmap *.php here', 'a snake_case_name and array[i] index'])(
        'leaves %s unescaped',
        (s) => {
            const out = roundTrip(s);

            expect(out).not.toContain('\\[');
            expect(out).not.toContain('\\*');
            expect(out).not.toContain('\\_');
            sameWords(s, out);
        },
    );
});

describe('single tildes stay literal — no over-escape, no accidental strikethrough', () => {
    it.each([
        '~10% for environment setup',
        'approximately ~5 minutes',
        'a ~ b ~ c',
        'from ~5~ to ~10~',
        'price ~5~ dollars',
        'path a~b~c here',
    ])('keeps %s byte-identical', (s) => {
        expect(roundTrip(s)).toBe(s);
    });

    it('still round-trips ~~strikethrough~~ (double tilde is GFM strike)', () => {
        expect(roundTrip('use ~~deprecated~~ here')).toContain('~~deprecated~~');
    });
});

describe('underscore delimiters stay literal — dunders/identifiers survive, * emphasis still works', () => {
    it.each(['Override __init__ then __call__', 'a _emphasis_ word', 'snake_case_name plus __dunder__'])(
        'keeps %s byte-identical',
        (s) => {
            expect(roundTrip(s)).toBe(s);
        },
    );

    it('still renders *star* / **star** emphasis (the toolbar delimiter)', () => {
        const out = roundTrip('use *italic* and **bold** here');
        expect(out).toContain('*italic*');
        expect(out).toContain('**bold**');
    });
});

describe('literal backslashes survive — no doubling (regex classes, Windows paths, escape sequences)', () => {
    it.each([
        'match \\d+ digits, \\w+ words, \\s whitespace, \\b boundary',
        'path C:\\Users\\bob\\report.txt',
        'escape \\n \\t \\r sequences and a\\Zb',
    ])('keeps %s byte-identical', (s) => {
        expect(roundTrip(s)).toBe(s);
    });
});

describe('bare URLs and emails stay literal — explicit [links] still work', () => {
    it.each(['see https://example.com/path now', 'contact me@example.com today', 'a <https://example.com> ref'])(
        'keeps %s byte-identical',
        (s) => {
            expect(roundTrip(s)).toBe(s);
        },
    );

    it('still round-trips an explicit [link](url)', () => {
        expect(roundTrip('[docs](https://example.com)')).toContain('[docs](https://example.com)');
    });
});

describe('inline marks round-trip', () => {
    it.each(['**bold**', '*italic*', '`code span`', '~~strike~~', '[a link](https://example.com)', '**bold `code` end**'])(
        'preserves %s',
        (s) => {
            expect(roundTrip(s)).toContain(s);
        },
    );
});

describe('MarkdownTable — cell pipes escaped + alignment preserved, idempotent', () => {
    it.each([
        ['pipe in a code-span cell', '| Op | Meaning |\n| --- | --- |\n| `\\|` | pipe op |\n| `\\|\\|` | or op |', 'pipe op'],
        ['pipes inside inline code', '| Name | Payload |\n| --- | --- |\n| chain | `echo \\| base64 \\| sh` |', 'base64'],
    ])('cell content survives two saves: %s', (_l, src, marker) => {
        const save1 = roundTrip(src);
        const save2 = roundTrip(save1);

        expect(save2).toBe(save1);
        expect(save2).toContain(marker);
    });

    it('preserves per-column alignment (left :--- / center :---: / right ---:)', () => {
        const save1 = roundTrip('| L | C | R |\n| :-- | :-: | --: |\n| a | b | c |');

        expect(save1).toContain('| :--- | :---: | ---: |');
        expect(roundTrip(save1)).toBe(save1);
    });
});

describe('nesting & sequencing — content preserved and converges (≤2 saves)', () => {
    it.each([
        ['bullet + code', '- item one\n- item two:\n\n  ```\n  code alpha\n  ```\n- item three'],
        ['ordered + code', '1. first\n2. second:\n\n   ```python\n   code beta\n   ```\n3. third'],
        ['nested bullets', '- outer aaa\n  - inner bbb\n    - deepest ccc'],
        ['blockquote + list', '> - quoted alpha\n> - quoted beta'],
        ['blockquote + code', '> intro\n>\n> ```\n> quoted code zeta\n> ```'],
        ['task list nested', '- [ ] task alpha\n  - [x] subtask beta\n- [x] task delta'],
        ['heading > list > code', '## Title\n\n- item alpha\n- item beta\n\n```\nstandalone epsilon\n```'],
        ['table > list > quote', '| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- item one\n\n> quote alpha'],
    ])('%s', (_l, src) => {
        const save1 = roundTrip(src);
        const save2 = roundTrip(save1);

        expect(save2).toBe(save1);
        sameWords(src, save2);
    });
});

// KNOWN BUG (marked parser, not our customizations — vanilla @tiptap/markdown repros it). A code block
// nested in a bullet sublist that is itself inside an ordered list is SILENTLY DROPPED. markdown-it kept
// it. 0 corpus docs hit it. This test pins the CURRENT (buggy) behavior so we notice if an upstream
// @tiptap/markdown release fixes it (then flip it to a passing round-trip + drop this note).
describe('KNOWN UPSTREAM BUG — ordered > bullet > code drops the code block', () => {
    it('still loses the deeply-nested code (remove this test once @tiptap/markdown fixes it)', () => {
        const out = roundTrip('1. lvl1\n   - lvl2\n\n     ```\n     deepcode\n     ```');

        expect(out).not.toContain('deepcode');
    });
});

describe('findVariableOccurrences — doc spans for the Available-variables cycle', () => {
    const docOf = (md: string) => {
        const editor = new Editor({ content: md, contentType: 'markdown', extensions: createMarkdownExtensions() });
        const { doc } = editor.state;
        editor.destroy();

        return doc;
    };

    it('locates every {{.Var}} and each span maps to the literal token', () => {
        const doc = docOf('Use {{.Foo}} then {{.Foo}} and {{.Bar}}.');
        const foo = findVariableOccurrences(doc, 'Foo');

        expect(foo).toHaveLength(2);

        for (const hit of foo) {
            expect(doc.textBetween(hit.from, hit.to)).toBe('{{.Foo}}');
        }

        expect(findVariableOccurrences(doc, 'Bar')).toHaveLength(1);
    });

    it('returns none for an unused variable (caller then inserts instead of cycling)', () => {
        expect(findVariableOccurrences(docOf('Use {{.Foo}} only.'), 'Missing')).toHaveLength(0);
    });

    it('matches inside control-flow actions but honors word boundaries', () => {
        const doc = docOf('{{if .Enabled}}on{{end}} but not {{.EnabledExtra}}');

        expect(findVariableOccurrences(doc, 'Enabled')).toHaveLength(1);
    });

    it('finds a {{.Var}} split across text nodes by a mark (mark-boundary fix)', () => {
        const doc = docOf('**{{**.Foo}} tail');

        // sanity — the variable really is split: bolding a brace gives the textblock >1 inline child
        expect(doc.firstChild?.childCount ?? 0).toBeGreaterThan(1);

        const foo = findVariableOccurrences(doc, 'Foo');

        expect(foo).toHaveLength(1);

        for (const hit of foo) {
            expect(doc.textBetween(hit.from, hit.to)).toBe('{{.Foo}}');
        }
    });

    it('spans the full token when a hard break sits inside it (non-text-node off-by-N)', () => {
        const doc = docOf('{{.Foo\\\n}}');

        // sanity — the hard break really is inside the token (text, hardBreak, text)
        expect(doc.firstChild?.childCount ?? 0).toBeGreaterThan(1);

        const foo = findVariableOccurrences(doc, 'Foo');

        expect(foo).toHaveLength(1);

        for (const hit of foo) {
            expect(doc.textBetween(hit.from, hit.to)).toBe('{{.Foo}}');
        }
    });
});
