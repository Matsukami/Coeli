import { Editor } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import { beforeAll, describe, expect, it } from 'vitest';

import { createMarkdownExtensions } from './markdown-editor-extensions';
import { shouldParseMarkdownOnPaste } from './markdown-editor-paste';
import { setupEditorJsdom } from './markdown-editor-test-setup';

beforeAll(setupEditorJsdom);

describe('shouldParseMarkdownOnPaste — markdown-parse plain text, defer rich sources', () => {
    it('parses plain-text markdown (no HTML on the clipboard)', () => {
        expect(shouldParseMarkdownOnPaste('# Heading', '', false)).toBe(true);
    });

    it('ignores an empty / whitespace-only paste', () => {
        expect(shouldParseMarkdownOnPaste('   \n\t ', '', false)).toBe(false);
    });

    it('defers an in-editor copy (data-pm-slice) so ProseMirror keeps its fidelity', () => {
        expect(shouldParseMarkdownOnPaste('# x', '<p data-pm-slice="1 1 []">x</p>', false)).toBe(false);
    });

    it.each([
        '<ul><li>x</li></ul>',
        '<table><tbody><tr><td>x</td></tr></tbody></table>',
        '<h2>x</h2>',
        '<blockquote>x</blockquote>',
        '<pre>x</pre>',
    ])('defers rich HTML carrying block tags: %s', (html) => {
        expect(shouldParseMarkdownOnPaste('# x', html, false)).toBe(false);
    });

    it('still parses when the HTML is only styled-inline (e.g. a VS Code span, no block tags)', () => {
        expect(shouldParseMarkdownOnPaste('**x**', '<span style="color:red">**x**</span>', false)).toBe(true);
    });

    it('keeps a paste inside a code context literal', () => {
        expect(shouldParseMarkdownOnPaste('# x', '', true)).toBe(false);
    });
});

describe('MarkdownPaste — the parsed payload matches load (same faithful markdown layer)', () => {
    const pasteEvent = (text: string, html = ''): ClipboardEvent =>
        ({
            clipboardData: { getData: (type: string) => (type === 'text/html' ? html : type === 'text/plain' ? text : '') },
        }) as unknown as ClipboardEvent;

    const pasteHtml = (text: string, html = ''): string => {
        const editor = new Editor({ content: '', contentType: 'markdown', extensions: createMarkdownExtensions() });
        editor.view.someProp('handlePaste', (handler) => handler(editor.view, pasteEvent(text, html), Slice.empty));
        const out = editor.getHTML();
        editor.destroy();

        return out;
    };

    it('parses pasted block markdown into rich blocks (heading + list + table)', () => {
        const html = pasteHtml('# Heading\n\n- one\n- two\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');

        expect(html).toContain('<h1>');
        expect(html).toContain('<ul>');
        expect(html).toContain('<table');
    });

    it('keeps _ and __ literal on paste, matching load (no <strong>/<em>)', () => {
        const html = pasteHtml('a __dunder__ and _under_ here');

        expect(html).not.toContain('<strong>');
        expect(html).not.toContain('<em>');
        expect(html).toContain('__dunder__');
    });

    it('defers to ProseMirror (no markdown parse) when the clipboard carries rich block HTML', () => {
        const html = pasteHtml('# fake', '<ul><li>web item</li></ul>');

        expect(html).not.toContain('<h1>');
    });
});
