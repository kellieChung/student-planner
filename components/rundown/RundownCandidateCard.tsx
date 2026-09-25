"use client";

import Tooltip from "@/components/ui/Tooltip";
import { useEffect, useRef, useState } from "react";
import { ProposedTask } from "@/types/proposedTask";
import { Course } from "@/types/course";
import { stripHtmlForDisplay } from "@/lib/htmlText";
import { findEvidenceRange, getEvidenceExcerpt } from "@/lib/evidenceHighlight";
import { parseLocalDate } from "@/lib/utils";
import {
    AlertIcon,
    CheckIcon,
    ChevronDownIcon,
    PencilIcon,
    QuestionIcon,
    XIcon,
} from "@/components/brand/Icons";
import { resolveDueTextToDate } from "@/lib/dueText";
import { classifyLabelType, LabelType } from "@/lib/taskLabel";
import CourseSelect from "@/components/CourseSelect";
import DatePicker from "@/components/DatePicker";
import Select from "@/components/ui/Select";

// The everyday review card for the Rundown's "AI found these" / Still-
// Deciding lists. Collapsed by default to what a quick yes/no needs (name,
// subject/type, due date, confidence, a one-line duplicate warning, the
// actions); "Show evidence" opens the audit detail — the highlighted
// announcement excerpt, the AI's reading, and the full Canvas comparison.
// mode="resolve" drops Maybe, for the Still-Deciding panel where only a
// final call makes sense.
// AIReviewCard's scrollIntoView is deliberately not used here: it scrolls
// every scrollable ancestor, so each card in the list would drag the whole
// Rundown overlay to itself. Instead only the announcement box's own
// scrollTop is moved to center the evidence highlight.
type RundownCandidateCardProps = {
    task: ProposedTask;
    courses: Course[];
    onCourseCreated: (course: Course) => void;
    onYes: (updatedTask?: ProposedTask) => void;
    onNo: () => void;
    onMaybe?: () => void;
    mode?: "default" | "resolve";
};

export default function RundownCandidateCard({
    task,
    courses,
    onCourseCreated,
    onYes,
    onNo,
    onMaybe,
    mode = "default",
}: RundownCandidateCardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [isEditingDue, setIsEditingDue] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [showFullAnnouncement, setShowFullAnnouncement] = useState(false);
    const [name, setName] = useState(task.name);
    const [course, setCourse] = useState(task.course);
    const [typeOverride, setTypeOverride] = useState(task.typeOverride ?? "");

    const [dueDate, setDueDate] = useState(() => {
        if (task.due) {
            return task.due;
        }

        if (task.dueText && task.sourceAnnouncement?.postedAt) {
            return (
                resolveDueTextToDate(
                    task.dueText,
                    new Date(task.sourceAnnouncement.postedAt)
                ) ?? ""
            );
        }

        return "";
    });

    const matchIsDefinite = task.canvasMatch.status === "definite";
    const matchIsPossible = task.canvasMatch.status === "possible";
    const matchIsUnresolved = task.canvasMatch.status === "unresolved";

    // A duplicate can be flagged (isDuplicate: true) without a resolvable
    // Canvas assignment to point at — e.g. the AI's matchingAssignmentId
    // didn't resolve (matchIsUnresolved) or resolved to a low-confidence
    // guess. That still needs to render as a flagged result, not silently
    // fall through to the "no duplicate" clean state the badge above would
    // then contradict.
    const isFlagged = matchIsDefinite || matchIsPossible || matchIsUnresolved;

    const hasMatch = isFlagged && task.canvasMatch.assignment !== null;

    const isFlaggedWithoutMatch = isFlagged && task.canvasMatch.assignment === null;

    const checkUnavailable = task.canvasMatch.status === "unavailable";

    const announcementText = task.sourceAnnouncement
        ? stripHtmlForDisplay(task.sourceAnnouncement.message)
        : "";

    const evidenceRange = task.evidence
        ? findEvidenceRange(announcementText, task.evidence)
        : null;

    const announcementBoxRef = useRef<HTMLDivElement>(null);
    const evidenceMarkRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const box = announcementBoxRef.current;
        const mark = evidenceMarkRef.current;

        if (!box || !mark) {
            return;
        }

        const offsetInBox =
            mark.getBoundingClientRect().top - box.getBoundingClientRect().top;

        box.scrollTo({
            top: box.scrollTop + offsetInBox - (box.clientHeight - mark.offsetHeight) / 2,
            behavior: "smooth",
        });
    }, [expanded, showFullAnnouncement, task.suggestionKey, evidenceRange?.start]);

    const assignmentDescription = task.canvasMatch.assignment?.description
        ? stripHtmlForDisplay(task.canvasMatch.assignment.description)
        : null;

    const autoTypeCode = classifyLabelType({
        name,
        course,
        isCustomCourse: courses.find((c) => c.name === course)?.isCustom,
    });

    const excerpt = evidenceRange ? getEvidenceExcerpt(announcementText, evidenceRange) : null;

    const assignmentDueShort = task.canvasMatch.assignment?.dueDate
        ? `${Number(task.canvasMatch.assignment.dueDate.slice(5, 7))}/${Number(task.canvasMatch.assignment.dueDate.slice(8, 10))}`
        : null;

    const dueLabel = dueDate
        ? `Due ${parseLocalDate(dueDate).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
          })}`
        : null;

    function handleYes() {
        onYes({
            ...task,
            name,
            course,
            typeOverride: (typeOverride || null) as ProposedTask["typeOverride"],
            due: dueDate || null,
        });
    }

    return (
        <div className="theme-surface w-full max-w-6xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-md">
            <div className="px-4 pt-4">
                {/* Title, edit, confidence */}

                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                        <h2 className="text-lg font-bold leading-snug tracking-tight">{name}</h2>

                        <Tooltip label={isEditing ? "Done editing" : "Edit task"}>
                            <button
                                type="button"
                                onClick={() => setIsEditing((editing) => !editing)}
                                aria-label={isEditing ? "Done editing" : "Edit task"}
                                className={`mt-0.5 shrink-0 rounded-md p-1 transition hover:text-[var(--accent)] ${
                                    isEditing ? "text-[var(--accent)]" : "text-[var(--muted)]"
                                }`}
                            >
                                {isEditing ? <CheckIcon size={15} /> : <PencilIcon size={15} />}
                            </button>
                        </Tooltip>
                    </div>

                    <span className="mt-0.5 shrink-0 rounded-full border border-[var(--border)] px-2.5 py-0.5 text-[11px] font-semibold capitalize text-[var(--muted)]">
                        {task.confidence} confidence
                    </span>
                </div>

                {isEditing && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1.5fr_1fr]">
                        <div>
                            <label
                                htmlFor="ai-task-name"
                                className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]"
                            >
                                Name
                            </label>
                            <input
                                id="ai-task-name"
                                type="text"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm font-semibold outline-none transition focus:ring-2 focus:ring-current/20"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">
                                Course
                            </label>
                            <CourseSelect
                                courses={courses}
                                value={course}
                                onChange={setCourse}
                                onCourseCreated={onCourseCreated}
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="ai-task-type"
                                className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]"
                            >
                                Type
                            </label>
                            <Select
                                id="ai-task-type"
                                value={typeOverride}
                                onChange={(next) => setTypeOverride(next as LabelType | "")}
                                options={[
                                    { value: "", label: `Auto (${autoTypeCode})` },
                                    { value: "HW", label: "HW" },
                                    { value: "R", label: "R (Reading)" },
                                    { value: "EXAM", label: "EXAM" },
                                    { value: "TODO", label: "TODO" },
                                ]}
                                className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm transition focus:border-[var(--accent)]"
                            />
                        </div>
                    </div>
                )}

                {/* Subject / type and due date */}

                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--muted)]">
                    <span>
                        {course} · {typeOverride || autoTypeCode}
                    </span>

                    <span aria-hidden="true">·</span>

                    {isEditingDue ? (
                        <DatePicker
                            defaultOpen
                            value={dueDate}
                            onChange={setDueDate}
                            onClose={() => setIsEditingDue(false)}
                            ariaLabel="Due date"
                            className="rounded-md border border-[var(--border)] bg-transparent px-2 py-0.5 text-sm text-[var(--foreground)] focus:border-[var(--accent)]"
                        />
                    ) : (
                        <Tooltip label={task.dueText ? `AI detected: ${task.dueText}` : "Set a due date"}>
                            <button
                                type="button"
                                onClick={() => setIsEditingDue(true)}
                                className="rounded-md font-semibold text-[var(--foreground)] underline decoration-dotted decoration-[var(--muted)] underline-offset-4 transition hover:text-[var(--accent)]"
                            >
                                {dueLabel ?? "No due date · Add"}
                            </button>
                        </Tooltip>
                    )}
                </div>

                {/* One-line duplicate status */}

                {isFlagged && (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-400">
                        <AlertIcon size={15} className="shrink-0" />

                        <span className="min-w-0 truncate">
                            {hasMatch
                                ? `May duplicate: ${task.canvasMatch.assignment?.name}${
                                      assignmentDueShort ? ` (due ${assignmentDueShort})` : ""
                                  }`
                                : "May already be covered by an existing assignment"}
                        </span>
                    </p>
                )}

                {checkUnavailable && (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-[var(--muted)]">
                        <QuestionIcon size={15} className="shrink-0" />
                        Duplicate check unavailable
                    </p>
                )}
            </div>

            {/* Actions */}

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-2.5">
                <button
                    type="button"
                    onClick={() => setExpanded((open) => !open)}
                    aria-expanded={expanded}
                    className="flex items-center gap-1 rounded-md py-1 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)]"
                >
                    <ChevronDownIcon
                        size={16}
                        className={`transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                    {expanded ? "Hide evidence" : "Show evidence"}
                </button>

                <div className="flex items-center gap-2">
                    {mode !== "resolve" && onMaybe && (
                        <button
                            type="button"
                            onClick={onMaybe}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--muted)] transition hover:bg-[var(--border)]/40 hover:text-[var(--foreground)]"
                        >
                            <QuestionIcon size={16} />
                            Maybe
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={onNo}
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3.5 py-2 text-sm font-semibold transition hover:border-[var(--status-overdue-text)] hover:bg-[color-mix(in_srgb,var(--status-overdue-text)_12%,transparent)]"
                    >
                        <XIcon size={16} />
                        No
                    </button>

                    <button
                        type="button"
                        onClick={handleYes}
                        className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[var(--accent-hover)]"
                    >
                        <CheckIcon size={16} />
                        Yes
                    </button>
                </div>
            </div>

            {/* Evidence (opt-in) */}

            {expanded && (
                <div className="flex flex-col gap-5 border-t border-[var(--border)] bg-[var(--border)]/10 p-4">
                    {/* Announcement excerpt */}

                    <div>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">
                            From the announcement
                        </p>

                        {task.sourceAnnouncement ? (
                            <div className="rounded-xl border border-[var(--border)] p-4">
                                <p className="font-bold">{task.sourceAnnouncement.title}</p>

                                <p className="mt-0.5 text-xs text-[var(--muted)]">
                                    {task.sourceAnnouncement.course}
                                </p>

                                {showFullAnnouncement ? (
                                    <div ref={announcementBoxRef} className="mt-3 max-h-72 overflow-y-auto pr-2">
                                        <p className="whitespace-pre-wrap text-sm leading-7">
                                            {evidenceRange ? (
                                                <>
                                                    {announcementText.slice(0, evidenceRange.start)}
                                                    <mark
                                                        ref={evidenceMarkRef}
                                                        className="rounded bg-[var(--accent)] px-1 font-bold text-white"
                                                    >
                                                        {announcementText.slice(
                                                            evidenceRange.start,
                                                            evidenceRange.end
                                                        )}
                                                    </mark>
                                                    {announcementText.slice(evidenceRange.end)}
                                                </>
                                            ) : (
                                                announcementText
                                            )}
                                        </p>
                                    </div>
                                ) : excerpt ? (
                                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
                                        {excerpt.leadingEllipsis && "… "}
                                        {excerpt.before}
                                        <mark className="rounded bg-[var(--accent)] px-1 font-bold text-white">
                                            {excerpt.match}
                                        </mark>
                                        {excerpt.after}
                                        {excerpt.trailingEllipsis && " …"}
                                    </p>
                                ) : (
                                    <div className="mt-3 text-sm leading-7">
                                        {task.evidence && (
                                            <p className="mb-2 italic text-[var(--muted)]">
                                                AI quoted: &ldquo;{task.evidence}&rdquo;
                                            </p>
                                        )}

                                        <p className="whitespace-pre-wrap">
                                            {announcementText.slice(0, 300)}
                                            {announcementText.length > 300 && " …"}
                                        </p>
                                    </div>
                                )}

                                {announcementText.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowFullAnnouncement((full) => !full)}
                                        className="mt-3 text-xs font-semibold text-[var(--accent)] underline underline-offset-2"
                                    >
                                        {showFullAnnouncement ? "Show less" : "Show full announcement"}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-[var(--muted)]">
                                Original announcement unavailable.
                            </p>
                        )}
                    </div>

                    {/* AI interpretation */}

                    {(task.description || task.dueText) && (
                        <div>
                            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">
                                AI&apos;s reading
                            </p>

                            {task.description && (
                                <p className="text-sm leading-6">{task.description}</p>
                            )}

                            {task.dueText && (
                                <p className="mt-1 text-xs text-[var(--muted)]">
                                    Due date detected: {task.dueText}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Canvas comparison */}

                    <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">
                                Canvas comparison
                            </p>

                            {matchIsDefinite && (
                                <span className="rounded-full border border-amber-500/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                                    Likely Duplicate
                                </span>
                            )}

                            {matchIsPossible && (
                                <span className="rounded-full border border-yellow-500/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-400">
                                    Possible Duplicate
                                </span>
                            )}

                            {matchIsUnresolved && (
                                <span className="rounded-full border border-yellow-500/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-400">
                                    Unresolved Match
                                </span>
                            )}
                        </div>

                        {hasMatch ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-xl border border-amber-500/40 p-4">
                                    <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
                                        AI proposed
                                    </p>

                                    <h3 className="mt-2 font-bold">{task.name}</h3>

                                    {task.description && (
                                        <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">
                                            {task.description}
                                        </p>
                                    )}
                                </div>

                                <div className="rounded-xl border border-amber-500/40 p-4">
                                    <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
                                        Existing Canvas assignment
                                    </p>

                                    <h3 className="mt-2 font-bold">
                                        {task.canvasMatch.assignment?.name}
                                    </h3>

                                    {assignmentDescription && (
                                        <p className="mt-1.5 max-h-40 overflow-y-auto text-sm leading-6 text-[var(--muted)]">
                                            {assignmentDescription}
                                        </p>
                                    )}

                                    {task.canvasMatch.assignment?.dueDate && (
                                        <p className="mt-3 text-xs text-[var(--muted)]">
                                            Due: {task.canvasMatch.assignment.dueDate}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ) : isFlaggedWithoutMatch ? (
                            <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 p-4">
                                <AlertIcon size={18} className="mt-0.5 shrink-0 text-amber-400" />

                                <div>
                                    <p className="font-semibold">
                                        {matchIsUnresolved ? "Possibly already covered" : "Possible duplicate"}
                                    </p>

                                    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                                        {matchIsUnresolved
                                            ? "The AI flagged this as possibly already covered by an existing assignment, but couldn't confirm which one."
                                            : "The AI flagged this task as a possible duplicate but couldn't point to a specific Canvas assignment."}
                                    </p>
                                </div>
                            </div>
                        ) : checkUnavailable ? (
                            <div className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-4">
                                <QuestionIcon size={18} className="mt-0.5 shrink-0 text-[var(--muted)]" />

                                <div>
                                    <p className="font-semibold">Duplicate check unavailable</p>

                                    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                                        The AI couldn&apos;t verify this task against your Canvas assignments.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-4">
                                <CheckIcon size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />

                                <div>
                                    <p className="font-semibold">No Canvas duplicate detected</p>

                                    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                                        The AI did not find an existing assignment that appears to represent this task.
                                    </p>
                                </div>
                            </div>
                        )}

                        {task.canvasMatch.reason && (isFlagged || checkUnavailable) && (
                            <p className="mt-3 text-sm leading-6">
                                <span className="font-semibold">Why the AI flagged this: </span>
                                {task.canvasMatch.reason}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
