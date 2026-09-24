// Characters ignored when comparing evidence to announcement text: the
// model quotes from a differently-stripped copy of the announcement (see
// extractActionableHtml in lib/ai/analyzeAnnouncement.ts, which puts a space
// wherever a tag was) than the one shown on screen (lib/htmlText.ts's
// stripHtmlForDisplay, which deletes tags outright), so the same quote can
// differ only in whitespace — e.g. "发到 第四周" vs "发到第四周". Emoji
// variation selectors / keycap marks are dropped for the same reason.
const IGNORED = /[\s​-‍︎️⃣]/u;

function foldChar(char: string): string {
    return char
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—]/g, "-")
        .replace(/\s/g, "");
}

// Comparison form of `value`, plus for each comparison UTF-16 unit the index
// in `value` it came from (so a match can be mapped back to real offsets).
function toComparable(value: string): { comparable: string; sourceIndex: number[] } {
    const sourceIndex: number[] = [];
    let comparable = "";

    for (let i = 0; i < value.length; ) {
        const char = String.fromCodePoint(value.codePointAt(i)!);

        if (!IGNORED.test(char)) {
            const folded = foldChar(char);

            comparable += folded;

            // One entry per UTF-16 unit (not per code point) so indexes into
            // `comparable` line up even after an astral character like an emoji.
            for (let unit = 0; unit < folded.length; unit++) {
                sourceIndex.push(i);
            }
        }

        i += char.length;
    }

    return { comparable, sourceIndex };
}

/**
 * Locates `evidence` inside already-display-cleaned announcement `text`
 * (see `lib/htmlText.ts`'s `stripHtmlForDisplay`) so the caller can
 * highlight the exact span the AI based its suggestion on. `evidence` is
 * asked to be a verbatim quote (see the RULES prompt in
 * lib/ai/analyzeAnnouncement.ts), but the model sees a differently-stripped
 * copy of the text, so an exact substring search alone missed roughly half
 * of real announcements. This tries the exact, case-insensitive match first,
 * then one that ignores whitespace, emoji variation selectors, and
 * curly-vs-straight quotes/dashes. It still never guesses at an
 * approximate/paraphrased match: a wrong highlight would be more misleading
 * than none, so a genuine paraphrase returns null.
 */
export function findEvidenceRange(
    text: string,
    evidence: string
): { start: number; end: number } | null {
    const trimmedEvidence = evidence.trim();

    if (!trimmedEvidence) {
        return null;
    }

    const exactStart = text.toLowerCase().indexOf(trimmedEvidence.toLowerCase());

    if (exactStart !== -1) {
        return { start: exactStart, end: exactStart + trimmedEvidence.length };
    }

    const target = toComparable(trimmedEvidence).comparable;

    if (!target) {
        return null;
    }

    const { comparable, sourceIndex } = toComparable(text);
    const matchStart = comparable.indexOf(target);

    if (matchStart === -1) {
        return null;
    }

    const start = sourceIndex[matchStart];
    const lastCharStart = sourceIndex[matchStart + target.length - 1];
    const end = lastCharStart + String.fromCodePoint(text.codePointAt(lastCharStart)!).length;

    return { start, end };
}

export type EvidenceExcerpt = {
    before: string;
    match: string;
    after: string;
    leadingEllipsis: boolean;
    trailingEllipsis: boolean;
};

/**
 * The highlighted span plus roughly `buffer` characters of context each
 * side, widened outward to the nearest whitespace so a word isn't cut in
 * half (CJK text, which has few spaces, just uses the raw buffer).
 */
export function getEvidenceExcerpt(
    text: string,
    range: { start: number; end: number },
    buffer = 160
): EvidenceExcerpt {
    let start = Math.max(0, range.start - buffer);
    let end = Math.min(text.length, range.end + buffer);

    if (start > 0) {
        const boundary = text.slice(start, range.start).search(/\s/);

        if (boundary !== -1) {
            start += boundary + 1;
        }
    }

    if (end < text.length) {
        const tail = text.slice(range.end, end);
        const boundary = tail.search(/\s\S*$/);

        if (boundary !== -1) {
            end = range.end + boundary;
        }
    }

    return {
        before: text.slice(start, range.start),
        match: text.slice(range.start, range.end),
        after: text.slice(range.end, end),
        leadingEllipsis: start > 0,
        trailingEllipsis: end < text.length,
    };
}
