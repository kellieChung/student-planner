import { createHash } from "node:crypto";

// Stable, content-derived identity for an AI-proposed task, used to
// persist an accept/reject decision (AnnouncementSuggestionReview)
// against it. A ProposedTask has no id of its own, and a positional index
// isn't safe — a re-run of the extraction prompt isn't guaranteed to
// produce tasks in the same order/count. This depends on the extraction
// call being deterministic (temperature: 0) for identical input to stay
// stable across runs; if the same announcement re-run produces a
// differently-worded task name for the same underlying work, its key
// changes and a previously-decided suggestion could resurface once — an
// accepted tradeoff of LLM-derived identity, not something worth chasing
// further.
export function computeSuggestionKey(
    sourceAnnouncementId: string,
    name: string
): string {
    const normalizedName = name.trim().toLowerCase().replace(/\s+/g, " ");

    return createHash("sha256")
        .update(`${sourceAnnouncementId}::${normalizedName}`)
        .digest("hex");
}

// Fingerprint of an announcement's text as last analyzed
// (Announcement.aiAnalyzedHash) — an edited announcement hashes
// differently and so gets re-analyzed instead of skipped.
export function computeAnnouncementContentHash(
    title: string,
    message: string
): string {
    return createHash("sha256")
        .update(`${title}\n${message}`)
        .digest("hex");
}
