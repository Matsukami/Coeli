import { Editor } from '@tiptap/core';

import { createMarkdownExtensions } from './markdown-editor-extensions';

// jsdom has no layout engine, so a mounted tiptap/ProseMirror view throws when it reads coordinates. Stub the
// three surfaces it touches (elementFromPoint + Range rects). Call from a test's beforeAll.
export const setupEditorJsdom = (): void => {
    document.elementFromPoint = () => null;
    const rect = { bottom: 0, height: 0, left: 0, right: 0, toJSON: () => ({}), top: 0, width: 0, x: 0, y: 0 };
    Range.prototype.getBoundingClientRect = () => rect as DOMRect;
    Range.prototype.getClientRects = () =>
        ({ item: () => null, length: 0, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
};

// The folder's standard load↔save round-trip: parse markdown into a headless editor and re-serialize.
export const roundTrip = (markdown: string): string => {
    const editor = new Editor({ content: markdown, contentType: 'markdown', extensions: createMarkdownExtensions() });
    const out = editor.getMarkdown();
    editor.destroy();

    return out;
};
