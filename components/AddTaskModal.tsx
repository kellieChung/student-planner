"use client";

import React, {useEffect, useState} from "react";
import {Assignment} from "@/types/assignment";
import {Course} from "@/types/course";
import StartDateField from "./StartDateField";
import CourseSelect from "./CourseSelect";

type AddTaskModalProps = {
    isOpen: boolean;
    // Pre-fills Due Date, e.g. when opened from a "+" on a specific
    // calendar day rather than the main "+ Add Task" button.
    defaultDue?: string;
    courses: Course[];
    onCourseCreated: (course: Course) => void;
    onClose: () => void;
    onAddTask: (newTask: Assignment, startDate: string, notes: string) => void;
};

export default function AddTaskModal({isOpen, defaultDue, courses, onCourseCreated, onClose, onAddTask}: AddTaskModalProps) {
    const [name, setName] = useState("");
    const [course, setCourse] = useState("Personal");
    const [due, setDue] = useState("");
    const [start, setStart] = useState("");
    const [notes, setNotes] = useState("");

    useEffect(() => {
        if (isOpen) {
            setDue(defaultDue ?? "");
        }
    }, [isOpen, defaultDue]);

    if (!isOpen) return null;

    const startAfterDue = Boolean(start && due && start > due);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(!name) return;
        if (startAfterDue) return;

        const newTask: Assignment = {
            id: `custom-${Date.now()}`,
            name,
            course,
            due,
            completed: false,
        };

        onAddTask(newTask, start, notes);

        setName("");
        setCourse("Personal");
        setDue("");
        setStart("");
        setNotes("");

        onClose();
    }
return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-[var(--overlay)] backdrop-blur-sm">
        <form
            onSubmit = {handleSubmit}
            className = "theme-surface planner-shell bg-slate-900 rounded-xl p-6 w-[400px] space-y-4 border border-slate-700 shadow-2xl"
        >
            <h2 className = "text-xl font-semibold">
                Add Task
            </h2>

            <div>
                <label className = "block text-sm mb-1">
                    Task Name
                </label>

                <input 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className = "w-full rounded bg-slate-800 px-3 py-2"
                    placeholder = "Finish Calculus Homework"
                />
            </div>

            <CourseSelect
                courses={courses}
                value={course}
                onChange={setCourse}
                onCourseCreated={onCourseCreated}
            />

            <div>
                <label className = "block text-sm mb-1">
                    Due Date
                </label>

                <input
                    type = "date"
                    value = {due}
                    onChange = {(e) => setDue(e.target.value)}
                    className = "w-full rounded bg-slate-800 px-3 py-2"
                />
            </div>

            <StartDateField value={start} onChange={setStart} />

            {startAfterDue && (
                <p className="text-xs font-medium text-rose-400">
                    Start date can&apos;t be after the due date.
                </p>
            )}

            <div>
                <label className = "block text-sm mb-1">
                    Notes
                </label>

                <textarea
                    rows = {2}
                    value = {notes}
                    onChange = {(e) => setNotes(e.target.value)}
                    placeholder = "Optional notes..."
                    className = "w-full rounded bg-slate-800 px-3 py-2 resize-none"
                />
            </div>

            <div className = "flex justify-end gap-2 pt-2">
                <button
                    type = "button"
                    onClick = {onClose}
                    className = "px-4 py-2 rounded bg-slate-700"
                >
                    Cancel
                </button>

                <button
                    type = "submit"
                    disabled = {startAfterDue}
                    className = "px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Add Task
                </button>
            </div>
        </form>
    </div>
)
}
