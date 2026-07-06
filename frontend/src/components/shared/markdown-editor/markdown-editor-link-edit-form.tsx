import type { Editor } from '@tiptap/react';

import { ArrowUpRight, Check, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';

import { normalizeLinkUrl } from './markdown-editor-toolbar-url';

interface LinkEditFormProps {
    // Focus the URL input on mount. True when the user explicitly opened the form (toolbar button); false for the
    // on-link popover, which appears whenever the caret enters a link and must not steal focus from the doc.
    autoFocus?: boolean;
    editor: Editor;
    initialUrl: string;
    isActive: boolean;
    onDone: () => void;
}

// Shared body of the link editor — the same URL field + validation + Apply/Open/Remove used by the toolbar Link
// popover AND the on-link popover (markdown-editor-link-handle.tsx). Seeds its own `url` from `initialUrl` on
// mount, so consumers give it a fresh `key` per editing session.
export function LinkEditForm({ autoFocus = true, editor, initialUrl, isActive, onDone }: LinkEditFormProps) {
    const [url, setUrl] = useState(initialUrl);

    // Normalized absolute href (scheme prepended, protocol validated) or null when the input is unsafe/empty.
    const href = normalizeLinkUrl(url);
    const isInvalid = url !== '' && href === null;

    const applyLink = () => {
        if (!href) {
            return;
        }

        const { empty } = editor.state.selection;

        if (empty && !isActive) {
            // No selection to wrap → insert the URL as its own linked text (matches Docs/Notion). Shows what the
            // user typed but links to the normalized href.
            editor
                .chain()
                .focus()
                .insertContent({ marks: [{ attrs: { href }, type: 'link' }], text: url.trim(), type: 'text' })
                .run();
        } else {
            editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
        }

        onDone();
    };

    const removeLink = () => {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        onDone();
    };

    const openInNewTab = () => {
        if (href) {
            window.open(href, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <InputGroup>
                <InputGroupInput
                    aria-invalid={isInvalid}
                    aria-label="Link URL"
                    autoFocus={autoFocus}
                    onChange={(event) => setUrl(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            applyLink();
                        }
                    }}
                    placeholder="https://example.com"
                    type="url"
                    value={url}
                />
                <InputGroupAddon
                    align="inline-end"
                    className="gap-0"
                >
                    <InputGroupButton
                        aria-label="Apply link"
                        disabled={url === '' || isInvalid}
                        onClick={applyLink}
                        size="icon-xs"
                    >
                        <Check />
                    </InputGroupButton>
                    <InputGroupButton
                        aria-label="Open link in new tab"
                        disabled={url === '' || isInvalid}
                        onClick={openInNewTab}
                        size="icon-xs"
                    >
                        <ArrowUpRight />
                    </InputGroupButton>
                    {isActive ? (
                        <InputGroupButton
                            aria-label="Remove link"
                            onClick={removeLink}
                            size="icon-xs"
                        >
                            <Trash2 />
                        </InputGroupButton>
                    ) : null}
                </InputGroupAddon>
            </InputGroup>
            {isInvalid ? (
                <p
                    className="text-destructive text-xs"
                    role="alert"
                >
                    Only http, https, mailto and tel links are allowed.
                </p>
            ) : null}
        </div>
    );
}
