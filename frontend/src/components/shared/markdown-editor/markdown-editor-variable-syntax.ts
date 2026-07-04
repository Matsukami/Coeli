// Pure Go-template `{{ … }}` matching — no ProseMirror/tiptap imports, so consumers that only need the
// syntax helpers (settings-prompt's variable panel: cycle + "used" count) can pull them without dragging the
// editor (and its tiptap chunk) into their eager bundle. The DOM-facing decoration side lives in
// markdown-editor-variable-highlight.ts, which reuses VARIABLE_RE / variableProbe from here.

// `[^{}]` keeps the scan linear (no catastrophic backtracking); Go actions never nest braces.
export const VARIABLE_RE = /\{\{[^{}]*\}\}/g;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Tests whether a single `{{ … }}` block references `variable` (`.Name` on a word boundary). Always used
// block-first — extract `{{ … }}` blocks with the linear VARIABLE_RE, THEN probe each — never a lazy
// `[^{}]*?` around the name, which backtracks O(n²) on an unclosed `{{`. Shared with settings-prompt.tsx
// (panel cycle + count) so the "used" badge and the editor cycle agree on what counts as a use.
export const variableProbe = (variable: string): RegExp => new RegExp(`\\.${escapeRegExp(variable)}\\b`);

export const findVariableUseRanges = (value: string, variable: string): { index: number; length: number }[] => {
    const probe = variableProbe(variable);
    const ranges: { index: number; length: number }[] = [];

    for (const match of value.matchAll(VARIABLE_RE)) {
        if (probe.test(match[0])) {
            ranges.push({ index: match.index, length: match[0].length });
        }
    }

    return ranges;
};
