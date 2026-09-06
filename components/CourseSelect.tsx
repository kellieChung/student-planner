"use client";

import React, {useState} from "react";
import {Course} from "@/types/course";

const ADD_NEW_VALUE = "__add_new__";

type CourseSelectProps = {
    courses: Course[];
    value: string;
    onChange: (name: string) => void;
    onCourseCreated: (course: Course) => void;
};

export default function CourseSelect({courses, value, onChange, onCourseCreated}: CourseSelectProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState("");
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const knownNames = new Set(courses.map((course) => course.name));
    const options = value && !knownNames.has(value)
        ? [{ id: value, name: value, hidden: false, isCustom: false }, ...courses]
        : courses;

    const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (e.target.value === ADD_NEW_VALUE) {
            setIsAdding(true);
            setNewName("");
            setError(null);
            return;
        }

        onChange(e.target.value);
    };

    const handleCreate = async () => {
        if (!newName.trim()) return;

        setCreating(true);
        setError(null);

        try {
            const response = await fetch("/api/courses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newName.trim() }),
            });

            if (!response.ok) throw new Error("Failed to create course.");

            const { course } = await response.json() as { course: Course };

            onCourseCreated(course);
            onChange(course.name);
            setIsAdding(false);
        } catch {
            setError("Couldn't create that course. Try again.");
        } finally {
            setCreating(false);
        }
    };

    if (isAdding) {
        return (
            <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                    New Course Name
                </label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="e.g. Personal"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                    <button
                        type="button"
                        disabled={creating || !newName.trim()}
                        onClick={handleCreate}
                        className="shrink-0 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Create
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsAdding(false)}
                        className="shrink-0 rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                    >
                        Cancel
                    </button>
                </div>
                {error && <p className="mt-1 text-xs font-medium text-rose-400">{error}</p>}
            </div>
        );
    }

    return (
        <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                Course / Category
            </label>
            <select
                value={value}
                onChange={handleSelect}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
                {!value && <option value="">Select a course...</option>}
                {options.map((course) => (
                    <option key={course.id} value={course.name}>
                        {course.name}
                    </option>
                ))}
                <option value={ADD_NEW_VALUE}>+ Add new course...</option>
            </select>
        </div>
    );
}
