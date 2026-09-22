"use client";

import { ProposedTask } from "@/types/proposedTask";
import { Course } from "@/types/course";
import RundownCandidateCard from "@/components/rundown/RundownCandidateCard";

// AutoTaskCreation.md's "still deciding" list — where a Maybe'd candidate
// parks. Deliberately blocking modal chrome (EditTaskModal.tsx's
// convention), unlike the ambient RundownOverlay: this only opens on an
// intentional click (the Taskbar's "Still deciding" badge), not
// automatically, so a full-block backdrop is fine here. Not gated by
// lastRundownViewedAt at all — stays reachable for as long as anything is
// parked here, regardless of what's "new."
type StillDecidingPanelProps = {
    candidates: ProposedTask[];
    courses: Course[];
    onCourseCreated: (course: Course) => void;
    onYes: (task: ProposedTask) => void;
    onNo: (task: ProposedTask) => void;
    onClose: () => void;
};

export default function StillDecidingPanel({
    candidates,
    courses,
    onCourseCreated,
    onYes,
    onNo,
    onClose,
}: StillDecidingPanelProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] backdrop-blur-sm p-4">
            <div className="theme-surface planner-shell bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl text-white">
                <div className="mb-4 flex items-start justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                            Still deciding
                        </p>
                        <h2 className="mt-1 text-lg font-bold text-slate-100">
                            {candidates.length} task{candidates.length === 1 ? "" : "s"} parked
                        </h2>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-400 hover:text-white text-lg px-2"
                    >
                        ✕
                    </button>
                </div>

                {candidates.length === 0 ? (
                    <p className="text-sm text-slate-400">Nothing parked right now.</p>
                ) : (
                    <div className="flex flex-col gap-6">
                        {candidates.map((candidate) => (
                            <RundownCandidateCard
                                key={candidate.suggestionKey}
                                task={candidate}
                                courses={courses}
                                onCourseCreated={onCourseCreated}
                                onYes={(updated) => onYes(updated ?? candidate)}
                                onNo={() => onNo(candidate)}
                                mode="resolve"
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
