import { describe, expect, it } from 'vitest';

import { isSafeImageSrc } from './markdown-editor-toolbar';

// The Image extension stores whatever src it is handed; isSafeImageSrc is the allowlist that blocks dangerous
// PROTOCOLS (javascript:, data:text/html, vbscript:, file:) before a src is saved. A bare relative string
// resolves against the page origin (http/https) and is intentionally allowed — the guard validates the
// protocol, not that the URL is absolute. data: URLs are limited to base64 raster formats: svg+xml is the one
// image type that can carry script.
describe('isSafeImageSrc — image-src protocol allowlist', () => {
    it.each([
        'http://example.com/a.png',
        'https://example.com/a.png',
        'data:image/png;base64,AAAA',
        'data:image/webp;base64,AAAA',
    ])('allows %s', (url) => {
        expect(isSafeImageSrc(url)).toBe(true);
    });

    it.each([
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'data:application/pdf;base64,AA',
        'data:image/svg+xml;utf8,<svg onload=alert(1)/>',
        'data:image/svg+xml;base64,AAAA',
        'vbscript:msgbox(1)',
        'file:///etc/passwd',
        'http://', // malformed → URL constructor throws → rejected via the catch
    ])('rejects %s', (url) => {
        expect(isSafeImageSrc(url)).toBe(false);
    });
});
