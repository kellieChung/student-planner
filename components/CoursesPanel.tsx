"use client";

import Tooltip from "@/components/ui/Tooltip";
import React, {useEffect, useState} from "react";
import {Course} from "@/types/course";
import {courseAbbreviationDefault} from "@/lib/taskLabel";
import {courseColorDefault} from "@/lib/courseColor";
import Spinner from "@/components/Spinner";
import Checkbox from "@/components/ui/Checkbox";
import ColorField from "@/components/ui/ColorField";

type CoursesPanelProps = {
    onChanged: () => void;
};

export default function CoursesPanel({onChanged}: CoursesPanelProps) {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [busyCourseId, setBusyCourseId] = useState<string | null>(null);
    const [newCourseName, setNewCourseName] = useState("");
    const [adding, setAdding] = useState(false);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [editingAbbrId, setEditingAbbrId] = useState<string | null>(null);
    const [abbrValue, setAbbrValue] = useState("");
    const [editingColorId, setEditingColorId] = useState<string | null>(null);
    const [colorValue, setColorValue] = useState("#3b82f6");

    useEffect(() => {
        setLoading(true);
        setError(null);
        setPendingDeleteId(null);

        fetch("/api/courses")
            .then((response) => response.json())
            .then((data: { courses?: Course[]; error?: string }) => {
                if (data.error) throw new Error(data.error);
                setCourses(data.courses ?? []);
            })
            .catch(() => setError("Couldn't load your courses."))
            .finally(() => setLoading(false));
    }, []);

    const toggleHidden = async (course: Course) => {
        setBusyCourseId(course.id);

        try {
            const response = await fetch(`/api/courses/${course.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hidden: !course.hidden }),
            });

            if (!response.ok) throw new Error("Failed to update course.");

            const { course: updated } = await response.json() as { course: Course };

            setCourses((current) =>
                current.map((c) => (c.id === updated.id ? updated : c))
            );

            onChanged();
        } catch {
            setError("Couldn't update that course. Try again.");
        } finally {
            setBusyCourseId(null);
        }
    };

    const deleteCourse = async (course: Course) => {
        setBusyCourseId(course.id);

        try {
            const response = await fetch(`/api/courses/${course.id}`, {
                method: "DELETE",
            });

            if (!response.ok) throw new Error("Failed to delete course.");

            setCourses((current) => current.filter((c) => c.id !== course.id));
            setPendingDeleteId(null);

            onChanged();
        } catch {
            setError("Couldn't delete that course. Try again.");
        } finally {
            setBusyCourseId(null);
        }
    };

    const addCourse = async () => {
        if (!newCourseName.trim()) return;

        setAdding(true);
        setError(null);

        try {
            const response = await fetch("/api/courses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newCourseName.trim() }),
            });

            if (!response.ok) throw new Error("Failed to add course.");

            const { course } = await response.json() as { course: Course };

            setCourses((current) => [...current, course]);
            setNewCourseName("");

            onChanged();
        } catch {
            setError("Couldn't add that course. Try again.");
        } finally {
            setAdding(false);
        }
    };

    const startRename = (course: Course) => {
        setRenamingId(course.id);
        setRenameValue(course.name);
    };

    const startEditAbbr = (course: Course) => {
        setEditingAbbrId(course.id);
        setAbbrValue(course.abbreviation ?? "");
    };

    const startEditColor = (course: Course) => {
        setEditingColorId(course.id);
        setColorValue(course.color ?? "#3b82f6");
    };

    const saveColor = async (course: Course, nextColor: string | null) => {
        if (nextColor === course.color) {
            setEditingColorId(null);
            return;
        }

        setBusyCourseId(course.id);

        try {
            const response = await fetch(`/api/courses/${course.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ color: nextColor ?? "" }),
            });

            if (!response.ok) throw new Error("Failed to update color.");

            const { course: updated } = await response.json() as { course: Course };

            setCourses((current) =>
                current.map((c) => (c.id === updated.id ? updated : c))
            );
            setEditingColorId(null);

            onChanged();
        } catch {
            setError("Couldn't update that course's color. Try again.");
        } finally {
            setBusyCourseId(null);
        }
    };

    const saveAbbr = async (course: Course) => {
        const trimmed = abbrValue.trim();

        if (trimmed === (course.abbreviation ?? "")) {
            setEditingAbbrId(null);
            return;
        }

        setBusyCourseId(course.id);

        try {
            const response = await fetch(`/api/courses/${course.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ abbreviation: trimmed }),
            });

            if (!response.ok) throw new Error("Failed to update abbreviation.");

            const { course: updated } = await response.json() as { course: Course };

            setCourses((current) =>
                current.map((c) => (c.id === updated.id ? updated : c))
            );
            setEditingAbbrId(null);

            onChanged();
        } catch {
            setError("Couldn't update that course's abbreviation. Try again.");
        } finally {
            setBusyCourseId(null);
        }
    };

    const saveRename = async (course: Course) => {
        if (!renameValue.trim() || renameValue.trim() === course.name) {
            setRenamingId(null);
            return;
        }

        setBusyCourseId(course.id);

        try {
            const response = await fetch(`/api/courses/${course.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: renameValue.trim() }),
            });

            if (!response.ok) throw new Error("Failed to rename course.");

            const { course: updated } = await response.json() as { course: Course };

            setCourses((current) =>
                current.map((c) => (c.id === updated.id ? updated : c))
            );
            setRenamingId(null);

            onChanged();
        } catch {
            setError("Couldn't rename that course. Try again.");
        } finally {
            setBusyCourseId(null);
        }
    };

    return (
        <div className="theme-surface planner-shell space-y-4 bg-slate-900 p-4">
            <div>
                <h2 className="text-lg font-semibold">Manage Courses</h2>
                <p className="mt-1 text-sm text-slate-400">
                    Hide a course to keep it out of your planner without losing its
                    data — it stays hidden even if Canvas still reports it as active.
                    Deleting a course removes it for good and it won&apos;t come back
                    on its own, even if Canvas still calls it active. A deleted
                    course also disappears from this list, since it no longer has a
                    row here. Deleted one by mistake (or need one back from a past
                    term)? Open the Lodestar extension popup and use
                    &quot;Find Canvas Courses&quot; to restore it — that&apos;s the
                    only way to bring a deleted course back.
                </p>
            </div>

            <div className="flex gap-2">
                <input
                    type="text"
                    value={newCourseName}
                    onChange={(e) => setNewCourseName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCourse()}
                    placeholder="e.g. Personal"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                    type="button"
                    disabled={adding || !newCourseName.trim()}
                    onClick={addCourse}
                    className="shrink-0 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {adding && <Spinner className="h-3.5 w-3.5" />}
                    {adding ? "Adding..." : "+ Add Course"}
                </button>
            </div>

            {loading && (
                <p className="flex items-center gap-2 text-sm text-slate-400">
                    <Spinner className="h-3.5 w-3.5" />
                    Loading courses...
                </p>
            )}

            {error && (
                <p className="text-sm text-red-400">{error}</p>
            )}

            {!loading && courses.length === 0 && !error && (
                <p className="text-sm text-slate-400">No courses yet.</p>
            )}

            <ul className="space-y-2">
                {courses.map((course) => (
                    <li
                        key={course.id}
                        className="flex flex-col gap-2 rounded-lg bg-slate-800 px-3 py-2"
                    >
                        <div className="flex items-center justify-between gap-3">
                            {renamingId === course.id ? (
                                <div className="flex flex-1 items-center gap-1">
                                    <input
                                        type="text"
                                        autoFocus
                                        value={renameValue}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && saveRename(course)}
                                        className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
                                    />
                                    <button
                                        type="button"
                                        disabled={busyCourseId === course.id}
                                        onClick={() => saveRename(course)}
                                        className="shrink-0 flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-xs font-semibold hover:bg-indigo-500"
                                    >
                                        {busyCourseId === course.id && <Spinner className="h-3 w-3" />}
                                        {busyCourseId === course.id ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRenamingId(null)}
                                        className="shrink-0 rounded bg-slate-700 px-2 py-1 text-xs"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <label className="flex flex-1 items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={!course.hidden}
                                        disabled={busyCourseId === course.id}
                                        onChange={() => toggleHidden(course)}
                                        ariaLabel={`Show ${course.name} in the planner`}
                                    />
                                    <span className={course.hidden ? "text-slate-500 line-through" : ""}>
                                        {course.name}
                                    </span>
                                    {course.isCustom && (
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            custom
                                        </span>
                                    )}
                                    <Tooltip label="Rename">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                startRename(course);
                                            }}
                                            className="text-slate-500 hover:text-slate-300"
                                            aria-label={`Rename ${course.name}`}
                                        >
                                            ✎
                                        </button>
                                    </Tooltip>

                                    {editingAbbrId === course.id ? (
                                        <div
                                            className="flex shrink-0 items-center gap-1"
                                            // preventDefault is fine here (unlike the color editor
                                            // below): a text input's click-to-focus happens at
                                            // mousedown, before the click event's default action
                                            // runs, so preventDefault on click has nothing to cancel
                                            // for it.
                                            onClick={(e) => e.preventDefault()}
                                        >
                                            <input
                                                type="text"
                                                autoFocus
                                                maxLength={6}
                                                value={abbrValue}
                                                onChange={(e) => setAbbrValue(e.target.value)}
                                                onKeyDown={(e) => e.key === "Enter" && saveAbbr(course)}
                                                className="w-14 rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-xs uppercase text-white focus:outline-none focus:border-indigo-500"
                                            />
                                            <button
                                                type="button"
                                                disabled={busyCourseId === course.id}
                                                onClick={() => saveAbbr(course)}
                                                className="shrink-0 flex items-center gap-1 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold hover:bg-indigo-500"
                                            >
                                                {busyCourseId === course.id && <Spinner className="h-2.5 w-2.5" />}
                                                {busyCourseId === course.id ? "Saving..." : "Save"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEditingAbbrId(null)}
                                                className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[10px]"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <Tooltip label="Edit the course code shown on planner cards">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    startEditAbbr(course);
                                                }}
                                                className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${course.abbreviation ? "border-indigo-700 text-indigo-300" : "border-slate-600 text-slate-500"}`}
                                            >
                                                {course.abbreviation ?? courseAbbreviationDefault(course.name)}
                                            </button>
                                        </Tooltip>
                                    )}

                                    {editingColorId === course.id ? (
                                        <div
                                            className="flex shrink-0 items-center gap-1"
                                            // Keeps a click here from reaching the row's <label>
                                            // (whose control is the "hidden" checkbox above). Use
                                            // stopPropagation, not preventDefault, so the colour
                                            // popover's own clicks still work.
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <ColorField
                                                defaultOpen
                                                ariaLabel="Badge colour"
                                                value={colorValue}
                                                onChange={setColorValue}
                                            />
                                            <button
                                                type="button"
                                                disabled={busyCourseId === course.id}
                                                onClick={() => saveColor(course, colorValue)}
                                                className="shrink-0 flex items-center gap-1 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold hover:bg-indigo-500"
                                            >
                                                {busyCourseId === course.id && <Spinner className="h-2.5 w-2.5" />}
                                                {busyCourseId === course.id ? "Saving..." : "Save"}
                                            </button>
                                            {course.color && (
                                                <Tooltip label="Reset to the auto-assigned color">
                                                    <button
                                                        type="button"
                                                        disabled={busyCourseId === course.id}
                                                        onClick={() => saveColor(course, null)}
                                                        className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[10px]"
                                                    >
                                                        Reset
                                                    </button>
                                                </Tooltip>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setEditingColorId(null)}
                                                className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[10px]"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <Tooltip label="Edit the badge color shown on planner cards">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    startEditColor(course);
                                                }}
                                                style={course.color ? { backgroundColor: course.color } : undefined}
                                                className={`h-4 w-4 shrink-0 rounded-full border border-slate-500 ${course.color ? "" : courseColorDefault(course.name)}`}
                                                aria-label={`Edit ${course.name}'s badge color`}
                                            />
                                        </Tooltip>
                                    )}
                                </label>
                            )}

                            {renamingId !== course.id && (
                                pendingDeleteId === course.id ? (
                                    <div className="flex shrink-0 items-center gap-1">
                                        <button
                                            type="button"
                                            disabled={busyCourseId === course.id}
                                            onClick={() => deleteCourse(course)}
                                            className="rounded bg-red-600 px-2 py-1 text-xs font-semibold hover:bg-red-500"
                                        >
                                            Confirm delete
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPendingDeleteId(null)}
                                            className="rounded bg-slate-700 px-2 py-1 text-xs"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setPendingDeleteId(course.id)}
                                        className="shrink-0 rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600"
                                    >
                                        Delete
                                    </button>
                                )
                            )}
                        </div>

                        {pendingDeleteId === course.id && (
                            <p className="text-[11px] text-slate-400">
                                {course.isCustom
                                    ? "This is permanent — nothing will re-add it."
                                    : "This is permanent — a sync won't bring it back. Use the extension's \"Find Canvas Courses\" to restore it later if you change your mind."}
                            </p>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
