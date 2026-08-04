import sanitizeHtmlLib from 'sanitize-html';

export function sanitizeSlug(slug: string): string {
    if (!slug) return '';
    let s = slug.normalize('NFKC').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, ""); // remove accents
    s = s.replace(/[・！？]/g, '-');
    // Allow alphanumeric, spaces, hyphens, and Japanese characters (Hiragana, Katakana, Kanji)
    s = s.replace(/[^\w\s\-\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '');
    return s.replace(/\s+/g, '-') // collapse whitespace and replace by hyphen
        .replace(/-+/g, '-') // collapse dashes
        .replace(/^-+|-+$/g, ''); // trim dashes from start and end
}

export function sanitizeTitle(title: string): string {
    if (!title) return '';
    // Normalize unicode and remove control characters
    return title.normalize('NFKC').replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
}

/**
 * Sanitize user-editable HTML content (TipTap editor, widgets, etc.).
 * Strips scripts, event handlers, and dangerous tags while preserving
 * formatting, media, and Tailwind utility classes.
 */
export function sanitizeHtml(dirty: string): string {
    if (!dirty) return '';
    return sanitizeHtmlLib(dirty, {
        allowedTags: sanitizeHtmlLib.defaults.allowedTags.concat([
            'img', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'span', 'div', 'details', 'summary', 'section', 'article', 'nav',
            'video', 'audio', 'source', 'picture', 'svg', 'path', 'g',
            'iframe'
        ]),
        allowedAttributes: {
            '*': ['class', 'id', 'style'],
            'a': ['href', 'target', 'rel', 'title'],
            'img': ['src', 'alt', 'width', 'height', 'loading', 'srcset', 'sizes'],
            'video': ['src', 'controls', 'autoplay', 'loop', 'muted', 'poster', 'width', 'height'],
            'audio': ['src', 'controls'],
            'source': ['src', 'type', 'srcset', 'sizes', 'media'],
            'td': ['colspan', 'rowspan'],
            'th': ['colspan', 'rowspan'],
            'iframe': ['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'title']
        },
        allowedSchemes: ['http', 'https', 'mailto'],
        allowedSchemesByTag: {
            img: ['http', 'https', 'data'],
        },
        disallowedTagsMode: 'discard',
        // Allow iframes from known embed domains
        allowedIframeHostnames: ['www.youtube.com', 'youtube.com', 'player.vimeo.com',
            'open.spotify.com', 'w.soundcloud.com']
    });
}

/**
 * Sanitize a JSON-LD schema string to prevent </script> breakout.
 * Also validates that it's parseable JSON.
 */
export function sanitizeJsonLd(json: string): string {
    if (!json) return '';
    try {
        JSON.parse(json); // validate
    } catch {
        return '';
    }
    return json.replace(/<\/script/gi, '<\\/script');
}
