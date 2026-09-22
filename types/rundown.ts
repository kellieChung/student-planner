import { ProposedTask } from "@/types/proposedTask";

// An AnnouncementSuggestionReview row with status "pending" or "maybe",
// as returned by GET /api/rundown-candidates. Carries the full
// ProposedTask snapshot from detection time (taskSnapshot) so the
// Rundown/Still-Deciding screens can render without re-running the AI
// pipeline.
export type PersistedCandidate = ProposedTask & {
    reviewStatus: "pending" | "maybe";
    // When this candidate was first detected (AnnouncementSuggestionReview
    // .createdAt) — used to compute a Maybe item's time-parked duration.
    firstSeenAt: string;
};

// A native-Canvas Assignment shown informationally in the Rundown's
// "Added from Canvas" section — already a real task by the time this
// renders, no decision needed.
export type AddedFromCanvasItem = {
    id: string;
    name: string;
    course: string;
    dueAt: string | null;
    htmlUrl: string | null;
};

export type RundownCandidatesResponse = {
    success: true;
    pending: PersistedCandidate[];
    maybe: PersistedCandidate[];
    addedFromCanvas: AddedFromCanvasItem[];
};
