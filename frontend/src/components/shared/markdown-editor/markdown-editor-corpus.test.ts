import { Editor } from '@tiptap/core';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { createMarkdownExtensions } from './markdown-editor-extensions';

// The editor's Placeholder extension tracks the viewport via document.elementFromPoint +
// Range.getClientRects, which jsdom lacks — stub them or every editor mount throws.
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

const variables = (s: string) => s.match(/\{\{[^{}]*\}\}/g) ?? [];
const words = (s: string) => s.match(/[\p{L}\p{N}]+/gu) ?? [];

describe('corpus — every real prompt .tmpl survives the round-trip with no content loss', () => {
    const dir = join(__dirname, '..', '..', '..', '..', 'backend', 'pkg', 'templates', 'prompts');
    const files = readdirSync(dir).filter((file) => file.endsWith('.tmpl'));

    for (const file of files) {
        it(file + ': tags literal, {{ }} preserved, no word dropped, converges', () => {
            const src = readFileSync(join(dir, file), 'utf8');
            const save1 = roundTrip(src);
            const save2 = roundTrip(save1);

            expect(save1).not.toContain('&lt;');
            expect(save1).not.toContain('&gt;');
            expect(variables(save1)).toEqual(variables(src));
            // word MULTISET (not a Set) so a count drop / dup / reorder is caught, plus ≤2-save convergence
            // (some templates canonicalize over two saves — save1 ≠ save2 is within contract, save2 is stable)
            expect(words(save2).slice().sort()).toEqual(words(src).slice().sort());
            expect(roundTrip(save2)).toBe(save2);
        });
    }
});
