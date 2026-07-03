// Deliberately does NOT re-export the heavy MarkdownEditor value — that would statically pull the tiptap chunk
// into any route importing a light util from here, defeating the lazy(MarkdownEditor) in settings-prompt /
// template. Import the component directly from './markdown-editor'. Only its type (erased) is safe to re-export.
export type { MarkdownEditorHandle } from './markdown-editor';
export { findVariableUseRanges, VARIABLE_RE, variableProbe } from './markdown-editor-variable-syntax';
export { EditorViewModeToggle } from './markdown-editor-view-mode';
export type { EditorViewMode } from './markdown-editor-view-mode';
