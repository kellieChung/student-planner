"use client";

import React, {useEffect, useState} from "react";
import {Course} from "@/types/course";

type ManageCoursesModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onChanged: () => void;
};

export default function ManageCoursesModal({isOpen, onClose, onChanged}: ManageCoursesModalProps) {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [busyCourseId, setBusyCourseId] = useState<string | null>(null);
    const [newCourseName, setNewCourseName] = useState("");
    const [adding, setAdding] = useState(false);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");

    useEffect(() => {
        if (!isOpen) return;

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
    }, [isOpen]);

    if (!isOpen) return null;

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
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-[var(--overlay)] backdrop-blur-sm">
            <div className="theme-surface planner-shell bg-slate-900 rounded-xl p-6 w-[440px] max-h-[80vh] overflow-y-auto space-y-4 border border-slate-700 shadow-2xl">
                <div>
                    <h2 className="text-xl font-semibold">Manage Courses</h2>
                    <p className="mt-1 text-sm text-slate-400">
                        Hide a course to keep it out of your planner without losing its
                        data — it stays hidden even if Canvas still reports it as active.
                        Deleting a synced course removes it for good, but it&apos;ll come
                        back on your next sync if Canvas still calls it active. Courses
                        you add yourself aren&apos;t synced, so deleting one is permanent.
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
                        className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        + Add Course
                    </button>
                </div>

                {loading && (
                    <p className="text-sm text-slate-400">Loading courses...</p>
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
                                            className="shrink-0 rounded bg-indigo-600 px-2 py-1 text-xs font-semibold hover:bg-indigo-500"
                                        >
                                            Save
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
                                        <input
                                            type="checkbox"
                                            checked={!course.hidden}
                                            disabled={busyCourseId === course.id}
                                            onChange={() => toggleHidden(course)}
                                        />
                                        <span className={course.hidden ? "text-slate-500 line-through" : ""}>
                                            {course.name}
                                        </span>
                                        {course.isCustom && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                                custom
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                startRename(course);
                                            }}
                                            className="text-slate-500 hover:text-slate-300"
                                            aria-label={`Rename ${course.name}`}
                                            title="Rename"
                                        >
                                            ✎
                                        </button>
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
                                        : "If Canvas still calls this course active, it'll come back on your next sync."}
                                </p>
                            )}
                        </li>
                    ))}
                </ul>

                <div className="flex justify-end pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded bg-slate-700"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
