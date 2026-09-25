"use client";

import React, {useEffect, useState} from "react";
import {RecurringTask} from "@/types/recurringTask";
import {Course} from "@/types/course";
import {describeRecurrenceRule} from "@/lib/recurrence";
import {getTodayString} from "@/lib/utils";
import RecurrenceField, {RecurrenceFieldValue} from "./RecurrenceField";
import CourseSelect from "./CourseSelect";
import DueTimeField from "./DueTimeField";
import Spinner from "./Spinner";
import useEscapeToClose from "@/components/ui/useEscapeToClose";

type RecurringTasksPanelProps = {
    isOpen: boolean;
    onClose: () => void;
    courses: Course[];
    onCourseCreated: (course: Course) => void;
    // Bumped by the caller whenever a series is created/edited/deleted, so
    // WeeklyPlannerView can refetch tasks/recurringTasks and re-materialize.
    onSeriesChanged: () => void;
};

function ruleToFieldValue(task: RecurringTask): RecurrenceFieldValue {
    return {
        enabled: true,
        frequency: task.frequency,
        interval: task.interval,
        weekdays: task.weekdays,
        endDate: task.endDate ?? "",
    };
}

export default function RecurringTasksPanel({isOpen, onClose, courses, onCourseCreated, onSeriesChanged}: RecurringTasksPanelProps) {
    const [tasks, setTasks] = useState<RecurringTask[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editCourse, setEditCourse] = useState("");
    const [editDueTime, setEditDueTime] = useState("");
    const [editRecurrence, setEditRecurrence] = useState<RecurrenceFieldValue | null>(null);

    useEscapeToClose(isOpen, onClose);

    useEffect(() => {
        if (!isOpen) return;

        setLoading(true);
        setError(null);

        fetch("/api/recurring-tasks")
            .then((response) => response.json())
            .then((data: { recurringTasks?: RecurringTask[]; error?: string }) => {
                if (data.error) throw new Error(data.error);
                setTasks(data.recurringTasks ?? []);
            })
            .catch(() => setError("Couldn't load your recurring tasks."))
            .finally(() => setLoading(false));
    }, [isOpen]);

    if (!isOpen) return null;

    const togglePause = async (task: RecurringTask) => {
        setBusyId(task.id);

        try {
            const response = await fetch(`/api/recurring-tasks/${task.id}`, {
                method: "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({active: !task.active}),
            });
            if (!response.ok) throw new Error("Failed to update recurring task.");

            const {recurringTask} = await response.json() as {recurringTask: RecurringTask};
            setTasks((current) => current.map((t) => (t.id === task.id ? recurringTask : t)));
            onSeriesChanged();
        } catch {
            setError("Couldn't update that recurring task. Try again.");
        } finally {
            setBusyId(null);
        }
    };

    const deleteSeries = async (task: RecurringTask) => {
        setBusyId(task.id);

        try {
            const response = await fetch(`/api/recurring-tasks/${task.id}?today=${getTodayString()}`, {method: "DELETE"});
            if (!response.ok) throw new Error("Failed to delete recurring task.");

            setTasks((current) => current.filter((t) => t.id !== task.id));
            setPendingDeleteId(null);
            onSeriesChanged();
        } catch {
            setError("Couldn't delete that recurring task. Try again.");
        } finally {
            setBusyId(null);
        }
    };

    const startEdit = (task: RecurringTask) => {
        setEditingId(task.id);
        setEditName(task.name);
        setEditCourse(task.course);
        setEditDueTime(task.dueTime ?? "");
        setEditRecurrence(ruleToFieldValue(task));
    };

    const saveEdit = async (task: RecurringTask) => {
        if (!editRecurrence || !editName.trim() || !editCourse.trim()) return;
        if (editRecurrence.frequency === "weekly" && editRecurrence.weekdays.length === 0) return;

        setBusyId(task.id);

        try {
            const response = await fetch(`/api/recurring-tasks/${task.id}`, {
                method: "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    name: editName.trim(),
                    course: editCourse.trim(),
                    dueTime: editDueTime || null,
                    frequency: editRecurrence.frequency,
                    interval: editRecurrence.interval,
                    weekdays: editRecurrence.weekdays,
                    endDate: editRecurrence.endDate || null,
                    today: getTodayString(),
                }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => null) as {error?: string} | null;
                throw new Error(data?.error ?? "Failed to update recurring task.");
            }

            const {recurringTask} = await response.json() as {recurringTask: RecurringTask};
            setTasks((current) => current.map((t) => (t.id === task.id ? recurringTask : t)));
            setEditingId(null);
            onSeriesChanged();
        } catch (error) {
            setError(error instanceof Error && error.message !== "Failed to update recurring task." ? error.message : "Couldn't update that recurring task. Try again.");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] backdrop-blur-sm p-4">
            <div role="dialog" aria-modal="true" aria-label="Recurring tasks" className="theme-surface planner-shell bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl text-white max-h-[85vh] overflow-y-auto">
                <div className="flex justify-between items-start mb-4">
                    <h2 className="text-lg font-bold text-slate-100">Recurring Tasks</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white text-lg px-2">
                        ✕
                    </button>
                </div>

                {loading && (
                    <p className="flex items-center gap-2 text-sm text-slate-400">
                        <Spinner className="h-3.5 w-3.5" />
                        Loading recurring tasks...
                    </p>
                )}

                {error && <p className="text-sm text-red-400">{error}</p>}

                {!loading && tasks.length === 0 && !error && (
                    <p className="text-sm text-slate-400">
                        No recurring tasks yet — turn on Repeat when adding or editing a task to start one.
                    </p>
                )}

                <ul className="space-y-2">
                    {tasks.map((task) => (
                        <li key={task.id} className="rounded-lg bg-slate-800 px-3 py-2 space-y-2">
                            {editingId === task.id && editRecurrence ? (
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white focus:border-indigo-500"
                                    />
                                    <CourseSelect
                                        courses={courses}
                                        value={editCourse}
                                        onChange={setEditCourse}
                                        onCourseCreated={onCourseCreated}
                                    />
                                    <DueTimeField value={editDueTime} onChange={setEditDueTime} />
                                    <RecurrenceField
                                        value={editRecurrence}
                                        onChange={setEditRecurrence}
                                        anchorDue={task.startDate}
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            disabled={busyId === task.id}
                                            onClick={() => saveEdit(task)}
                                            className="flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold hover:bg-indigo-500"
                                        >
                                            {busyId === task.id && <Spinner className="h-3 w-3" />}
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditingId(null)}
                                            className="rounded bg-slate-700 px-3 py-1.5 text-xs"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className={task.active ? "" : "opacity-50"}>
                                            <p className="text-sm font-semibold">{task.name}</p>
                                            <p className="text-xs text-slate-400">
                                                {task.course} · {describeRecurrenceRule(task)}
                                                {!task.active && " · paused"}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            disabled={busyId === task.id}
                                            onClick={() => startEdit(task)}
                                            className="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
                                        >
                                            Edit pattern
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busyId === task.id}
                                            onClick={() => togglePause(task)}
                                            className="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
                                        >
                                            {task.active ? "Pause" : "Resume"}
                                        </button>
                                        {pendingDeleteId === task.id ? (
                                            <>
                                                <button
                                                    type="button"
                                                    disabled={busyId === task.id}
                                                    onClick={() => deleteSeries(task)}
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
                                            </>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setPendingDeleteId(task.id)}
                                                className="rounded bg-slate-700 px-2 py-1 text-xs text-rose-400 hover:bg-rose-950/40"
                                            >
                                                Delete series
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
