/**
 * Locates `evidence` inside already-display-cleaned announcement `text`
 * (see `lib/htmlText.ts`'s `stripHtmlForDisplay`) so the caller can
 * highlight the exact span the AI based its suggestion on. `evidence` is
 * documented (see the RULES prompt in lib/ai/analyzeAnnouncement.ts) as a
 * "short quote or paraphrase" — not guaranteed to be verbatim — so this is
 * a case-insensitive exact-substring search only. When `evidence` doesn't
 * appear verbatim, this returns null rather than guessing at an
 * approximate match: a wrong highlight would be more misleading than no
 * highlight, and the evidence text is still shown separately regardless.
 */
export function findEvidenceRange(
    text: string,
    evidence: string
): { start: number; end: number } | null {
    const trimmedEvidence = evidence.trim();

    if (!trimmedEvidence) {
        return null;
    }

    const start = text.toLowerCase().indexOf(trimmedEvidence.toLowerCase());

    if (start === -1) {
        return null;
    }

    return { start, end: start + trimmedEvidence.length };
}
