"use client";

import { ProposedTask } from "@/types/proposedTask";
import { Course } from "@/types/course";
import RundownCandidateCard from "@/components/rundown/RundownCandidateCard";

// AutoTaskCreation.md's "AI found these" — every AI-detected candidate
// (including duplicate-suspects and unresolved/invalid-match cases) needs
// a real Yes/No/Maybe decision; nothing here is pre-suppressed or
// pre-added without the user seeing it (auto-accept, when enabled, has
// already filtered these out server-side before they ever reach this
// list — see lib/rundownAutoAccept.ts).
type AiFoundSectionProps = {
    candidates: ProposedTask[];
    courses: Course[];
    onCourseCreated: (course: Course) => void;
    onYes: (task: ProposedTask) => void;
    onNo: (task: ProposedTask) => void;
    onMaybe: (task: ProposedTask) => void;
};

export default function AiFoundSection({
    candidates,
    courses,
    onCourseCreated,
    onYes,
    onNo,
    onMaybe,
}: AiFoundSectionProps) {
    if (candidates.length === 0) {
        return null;
    }

    return (
        <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                AI found these ({candidates.length})
            </p>

            <div className="flex flex-col gap-3">
                {candidates.map((candidate) => (
                    <RundownCandidateCard
                        key={candidate.suggestionKey}
                        task={candidate}
                        courses={courses}
                        onCourseCreated={onCourseCreated}
                        onYes={(updated) => onYes(updated ?? candidate)}
                        onNo={() => onNo(candidate)}
                        onMaybe={() => onMaybe(candidate)}
                    />
                ))}
            </div>
        </div>
    );
}
