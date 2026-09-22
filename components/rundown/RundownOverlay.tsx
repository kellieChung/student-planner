"use client";

import { ProposedTask } from "@/types/proposedTask";
import { Course } from "@/types/course";
import { AddedFromCanvasItem } from "@/types/rundown";
import AddedFromCanvasSection from "@/components/rundown/AddedFromCanvasSection";
import AiFoundSection from "@/components/rundown/AiFoundSection";
import DetectionTriggerControls from "@/components/rundown/DetectionTriggerControls";

// AutoTaskCreation.md's "rundown" screen — the first thing shown on app
// open whenever there's anything new since the user's last visit, but
// deliberately NOT a blocking modal: the `pointer-events-none` root +
// `pointer-events-auto` panel (components/world/OnboardingOverlay.tsx's
// "tour" pattern) means the real OS underneath stays clickable, and the
// only way to leave is the explicit close button — nothing here is a
// forced action.
type RundownOverlayProps = {
    pendingCandidates: ProposedTask[];
    addedFromCanvas: AddedFromCanvasItem[];
    courses: Course[];
    onCourseCreated: (course: Course) => void;
    onYes: (task: ProposedTask) => void;
    onNo: (task: ProposedTask) => void;
    onMaybe: (task: ProposedTask) => void;
    onRemoveCanvasItem: (item: AddedFromCanvasItem) => void;
    onNewCandidates: (tasks: ProposedTask[]) => void;
    onRunFinished?: () => void;
    onClose: () => void;
};

export default function RundownOverlay({
    pendingCandidates,
    addedFromCanvas,
    courses,
    onCourseCreated,
    onYes,
    onNo,
    onMaybe,
    onRemoveCanvasItem,
    onNewCandidates,
    onRunFinished,
    onClose,
}: RundownOverlayProps) {
    return (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center sm:p-6">
            <div
                className="theme-surface pointer-events-auto flex w-full max-w-4xl flex-col rounded-2xl border shadow-2xl"
                style={{ background: "var(--panel)", borderColor: "var(--border)", maxHeight: "85vh" }}
            >
                <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
                            Rundown
                        </p>
                        <h2 className="mt-1 text-xl font-bold">What&apos;s new</h2>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg px-2 py-1 text-lg text-[var(--muted)] transition hover:text-[var(--foreground)]"
                        aria-label="Close rundown"
                    >
                        ✕
                    </button>
                </div>

                <div className="flex flex-col gap-6 overflow-y-auto px-6 py-5">
                    <AddedFromCanvasSection items={addedFromCanvas} onRemove={onRemoveCanvasItem} />

                    <AiFoundSection
                        candidates={pendingCandidates}
                        courses={courses}
                        onCourseCreated={onCourseCreated}
                        onYes={onYes}
                        onNo={onNo}
                        onMaybe={onMaybe}
                    />

                    {pendingCandidates.length === 0 && addedFromCanvas.length === 0 && (
                        <p className="text-sm text-[var(--muted)]">
                            Nothing new since your last visit.
                        </p>
                    )}

                    <div className="border-t border-[var(--border)] pt-5">
                        <DetectionTriggerControls
                            onNewCandidates={onNewCandidates}
                            onRunFinished={onRunFinished}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
