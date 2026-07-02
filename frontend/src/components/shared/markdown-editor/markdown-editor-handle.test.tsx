import { render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { MarkdownEditor, type MarkdownEditorHandle } from './markdown-editor';

beforeAll(() => {
    document.elementFromPoint = () => null;
    const r = { bottom: 0, height: 0, left: 0, right: 0, toJSON: () => ({}), top: 0, width: 0, x: 0, y: 0 };
    Range.prototype.getBoundingClientRect = () => r as DOMRect;
    Range.prototype.getClientRects = () =>
        ({ item: () => null, length: 0, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
});

const proseMirror = (c: HTMLElement) => c.querySelector('.ProseMirror');

describe('MarkdownEditor imperative handle', () => {
    it('cycleToVariable: rejects a missing variable, cycles an existing one (with wrap) without throwing', async () => {
        const ref = createRef<MarkdownEditorHandle>();
        const { container } = render(
            <MarkdownEditor onChange={vi.fn()} ref={ref} value={'a {{.Foo}} b {{.Foo}} c {{.Bar}}'} />,
        );
        await waitFor(() => expect(proseMirror(container)?.textContent).toContain('Foo'));

        expect(ref.current?.cycleToVariable('Nope')).toBe(false);
        // two occurrences → advance, advance (wrap), and a second distinct variable — always found, never throws
        expect(ref.current?.cycleToVariable('Foo')).toBe(true);
        expect(ref.current?.cycleToVariable('Foo')).toBe(true);
        expect(ref.current?.cycleToVariable('Foo')).toBe(true);
        expect(ref.current?.cycleToVariable('Bar')).toBe(true);
    });

    it('insertAtCursor: emits the inserted text through onChange', async () => {
        const onChange = vi.fn();
        const ref = createRef<MarkdownEditorHandle>();
        const { container } = render(<MarkdownEditor onChange={onChange} ref={ref} value={'seed'} />);
        await waitFor(() => expect(proseMirror(container)?.textContent).toContain('seed'));
        onChange.mockClear();

        ref.current?.insertAtCursor('ZZZ');
        await waitFor(() => expect(onChange).toHaveBeenCalled());
        expect(String(onChange.mock.calls.at(-1)?.[0])).toContain('ZZZ');
    });
});

describe('MarkdownEditor value↔editor sync', () => {
    it('suppresses onChange for an echoed value and applies a real external change', async () => {
        const onChange = vi.fn();
        const ref = createRef<MarkdownEditorHandle>();
        const { container, rerender } = render(<MarkdownEditor onChange={onChange} ref={ref} value={'start'} />);
        await waitFor(() => expect(proseMirror(container)?.textContent).toContain('start'));

        ref.current?.insertAtCursor(' edited');
        await waitFor(() => expect(onChange).toHaveBeenCalled());
        const emitted = String(onChange.mock.calls.at(-1)?.[0]);
        onChange.mockClear();

        // Echo our own emitted value back → the sync effect must early-return, not re-fire onChange.
        rerender(<MarkdownEditor onChange={onChange} ref={ref} value={emitted} />);
        await Promise.resolve();
        expect(onChange).not.toHaveBeenCalled();

        // A genuine external change → the editor content updates (setContent uses emitUpdate:false, so no onChange).
        rerender(<MarkdownEditor onChange={onChange} ref={ref} value={'external replacement text'} />);
        await waitFor(() => expect(proseMirror(container)?.textContent).toContain('external replacement text'));
        expect(onChange).not.toHaveBeenCalled();
    });
});
