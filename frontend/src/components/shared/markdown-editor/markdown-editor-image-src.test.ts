import { describe, expect, it } from 'vitest';

import { isSafeImageSrc } from './markdown-editor';

// The Image extension stores whatever src it is handed; isSafeImageSrc is the allowlist that blocks dangerous
// PROTOCOLS (javascript:, data:text/html, vbscript:, file:) before a src is saved. A bare relative string
// resolves against the page origin (http/https) and is intentionally allowed — the guard validates the
// protocol, not that the URL is absolute.
describe('isSafeImageSrc — image-src protocol allowlist', () => {
    it.each([
        'http://example.com/a.png',
        'https://example.com/a.png',
        'data:image/png;base64,AAAA',
        'data:image/svg+xml;utf8,<svg/>',
    ])('allows %s', (url) => {
        expect(isSafeImageSrc(url)).toBe(true);
    });

    it.each([
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'data:application/pdf;base64,AA',
        'vbscript:msgbox(1)',
        'file:///etc/passwd',
        'http://', // malformed → URL constructor throws → rejected via the catch
    ])('rejects %s', (url) => {
        expect(isSafeImageSrc(url)).toBe(false);
    });
});
