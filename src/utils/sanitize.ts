import sanitize from 'sanitize-html';

export function sanitizeHtml(dirty: string): string { 
    if (!dirty) return '';
    return sanitize(dirty, {
        allowedTags: [
            ...sanitize.defaults.allowedTags,
            'img', 'iframe', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'span', 'details', 'summary', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
            'del', 'sup', 'sub', 'u', 'mark'
        ],
        allowedAttributes: {
            '*': ['class', 'id', 'style', 'data-*'],
            'a': ['href', 'name', 'target', 'rel', 'title'],
            'img': ['src', 'srcset', 'alt', 'title', 'width', 'height', 'loading'],
            'iframe': ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'loading'],
            'th': ['colspan', 'rowspan'],
            'td': ['colspan', 'rowspan'],
            'details': ['open']
        },
        allowedIframeHostnames: ['www.youtube.com', 'player.vimeo.com', 'open.spotify.com', 'w.soundcloud.com', 'platform.twitter.com'],
        allowedSchemes: ['http', 'https', 'ftp', 'mailto', 'tel'],
        allowProtocolRelative: true,
    });
}
