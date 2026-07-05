// Deliberately does NOT re-export the heavy MarkdownEditor value — that would statically pull the tiptap chunk
// into any route importing a light util from here. Consume the mode-switching MarkdownEditorField instead (it
// owns the lazy() boundary, so importing it is chunk-free until rich mode renders).
export { MarkdownEditorField } from './markdown-editor-field';
export type { MarkdownEditorFieldHandle } from './markdown-editor-field';
export { findVariableUseRanges, VARIABLE_RE, variableProbe } from './markdown-editor-variable-syntax';
export { EditorViewModeToggle } from './markdown-editor-view-mode';
export type { EditorViewMode } from './markdown-editor-view-mode';
