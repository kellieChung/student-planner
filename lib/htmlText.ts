/**
 * Removes HTML from Canvas rich-text fields (assignment descriptions,
 * announcement messages) — Canvas stores these as raw HTML, which can
 * carry enormous amounts of markup/styling that an AI prompt doesn't need.
 */
export function stripHtml(html: string): string {
    return html
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Caps text length for an AI prompt. Without this, a single long field
 * can push a whole batch past the model's context window (see
 * lib/ollamaConfig.ts's OLLAMA_NUM_CTX) — silently degrading output
 * quality or timing out, rather than a case where more content helps.
 */
export function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
        return text;
    }

    return text.slice(0, maxLength).trim() + "...";
}

/**
 * Removes HTML for on-screen display rather than for an AI prompt (see
 * `stripHtml` above) — the difference is that `stripHtml` deliberately
 * collapses all whitespace/structure to a single space for prompt
 * compactness, which would turn a paragraph-formatted Canvas message into
 * an unreadable wall of run-on text if reused here. This instead preserves
 * paragraph/line breaks so callers rendering into a `whitespace-pre-wrap`
 * element get something that reads like the original announcement.
 */
export function stripHtmlForDisplay(html: string): string {
    return html
        .replace(/<a\s+[^>]*href="[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, "$1")
        .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<li[^>]*>/gi, "• ")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
