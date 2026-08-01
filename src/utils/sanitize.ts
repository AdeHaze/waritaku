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
