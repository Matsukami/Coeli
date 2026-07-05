import { findVariableUseRanges, nextVariableRange } from './markdown-editor-variable-syntax';

/** Select the next occurrence of `variable` in the textarea and scroll it to the middle. Returns false if none. */
export function cycleTextareaToVariable(textarea: HTMLTextAreaElement, variable: string): boolean {
    const ranges = findVariableUseRanges(textarea.value, variable).map(({ index, length }) => ({
        end: index + length,
        start: index,
    }));
    const target = nextVariableRange(ranges, textarea.selectionStart, textarea.selectionEnd);

    if (!target) {
        return false;
    }

    textarea.focus();
    textarea.setSelectionRange(target.start, target.end);
    textarea.scrollTop = Math.max(0, caretOffsetTop(textarea, target.start) - textarea.clientHeight / 2);

    return true;
}

/** Splice `text` over the textarea selection, emit through `onChange`, and restore the caret after the value round-trips. */
export function insertTextareaText(
    textarea: HTMLTextAreaElement,
    text: string,
    onChange: (value: string) => void,
): void {
    const start = Math.max(0, textarea.selectionStart);
    const end = Math.max(0, textarea.selectionEnd);
    const { value } = textarea;

    onChange(value.slice(0, start) + text + value.slice(end));

    // The controlled re-render clears the selection; restore the caret once React has flushed the new value.
    setTimeout(() => {
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
}

// Pixel offset of `position` from the textarea content top, measured via a hidden mirror so soft-wrapped
// lines count — a logical-line count undershoots the scroll badly for wrapped templates.
function caretOffsetTop(textarea: HTMLTextAreaElement, position: number): number {
    const computedStyle = getComputedStyle(textarea);
    const mirror = document.createElement('div');

    mirror.style.fontFamily = computedStyle.fontFamily;
    mirror.style.fontSize = computedStyle.fontSize;
    mirror.style.fontWeight = computedStyle.fontWeight;
    mirror.style.fontStyle = computedStyle.fontStyle;
    mirror.style.lineHeight = computedStyle.lineHeight;
    mirror.style.letterSpacing = computedStyle.letterSpacing;
    mirror.style.wordSpacing = computedStyle.wordSpacing;
    mirror.style.paddingTop = computedStyle.paddingTop;
    mirror.style.paddingRight = computedStyle.paddingRight;
    mirror.style.paddingBottom = computedStyle.paddingBottom;
    mirror.style.paddingLeft = computedStyle.paddingLeft;
    mirror.style.width = `${textarea.clientWidth}px`;
    mirror.style.boxSizing = 'border-box';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.top = '-9999px';
    mirror.style.left = '-9999px';

    mirror.textContent = textarea.value.slice(0, position);
    const marker = document.createElement('span');
    marker.textContent = textarea.value.charAt(position) || '.';
    mirror.appendChild(marker);

    document.body.appendChild(mirror);
    const offset = marker.offsetTop;
    mirror.remove();

    return offset;
}
