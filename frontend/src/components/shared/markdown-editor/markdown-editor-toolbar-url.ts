// Authoring-time protocol allowlists for the toolbar's Link and Image popovers. They keep javascript:/data:text
// (and, for images, script-capable data:image/svg+xml) out of the persisted document so fidelity never depends on
// every future render path sanitizing them. Load/paste bypass these — tiptap Link's isAllowedUri and the
// read-only viewer sanitize protocols on render; an <img src> is inert regardless.

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

const KNOWN_LINK_SCHEME = /^(?:https?:\/\/|mailto:|tel:)/i;

// A scheme-less link ("example.com", "localhost:3000") must be made absolute, or the browser resolves it against
// the current origin as a relative path. Prepend https:// unless the input already carries an allowed scheme, then
// validate the protocol. Validate with NO base URL — passing window.location as base (as a plain protocol check
// would) launders a relative value into https: and is exactly the bug this replaces. Returns the normalized href,
// or null for unsafe/malformed input (javascript:/data:/file:, empty). Neither tiptap nor its UI normalize manual
// entry — both persist the raw href verbatim — so we do it here.
export const normalizeLinkUrl = (raw: string): null | string => {
    const url = raw.trim();

    if (!url) {
        return null;
    }

    const candidate = KNOWN_LINK_SCHEME.test(url) ? url : `https://${url.replace(/^\/+/, '')}`;

    try {
        return SAFE_LINK_PROTOCOLS.has(new URL(candidate).protocol) ? candidate : null;
    } catch {
        return null;
    }
};

const RASTER_IMAGE_DATA = /^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,/i;

// Image analog of normalizeLinkUrl: a scheme-less src ("example.com/a.png") is made absolute with https://; an
// already-schemed http(s) URL and a base64 raster data: URL pass through. data:image/svg+xml is rejected — SVG
// can carry script. Returns the normalized src, or null for unsafe/malformed input.
export const normalizeImageSrc = (raw: string): null | string => {
    const src = raw.trim();

    if (!src) {
        return null;
    }

    const candidate = /^(?:https?:\/\/|data:)/i.test(src) ? src : `https://${src.replace(/^\/+/, '')}`;

    if (/^data:/i.test(candidate)) {
        return RASTER_IMAGE_DATA.test(candidate) ? candidate : null;
    }

    try {
        const { protocol } = new URL(candidate);

        return protocol === 'http:' || protocol === 'https:' ? candidate : null;
    } catch {
        return null;
    }
};
