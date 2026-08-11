"use client";

import React, {useState} from "react";
import {Assignment} from "@/types/assignment";

type AddTaskModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onAddTask: (newTask: Assignment) => void;
};

export default function AddTaskModal({isOpen, onClose, onAddTask}: AddTaskModalProps) {
    const [name, setName] = useState("");
    const [course, setCourse] = useState("Personal");
    const [due, setDue] = useState("");

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(!name) return;

        const newTask: Assignment = {
            id: `custom-${Date.now()}`,
            name, 
            course,
            due,
            completed: false,
        };

        onAddTask(newTask);

        setName("");
        setCourse("Personal");
        setDue("");

        onClose();
    }
return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <form
            onSubmit = {handleSubmit}
            className = "bg-slate-900 rounded-xl p-6 w-[400px] space-y-4 border border-slate-700"
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

            <div>
                <label className = "block text-sm mb-1">
                    Course / Tag
                </label>

                <input
                    value = {course}
                    onChange = {(e) => setCourse(e.target.value)}
                    className = "w-full rounded bg-slate-800 px-3 py-2"
                    placeholder = "Personal"
                />
            </div>

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
                    className = "px-4 py-2 rounded bg-blue-600 hover:bg-blue-500"
                >
                    Add Task
                </button>
            </div>
        </form>
    </div>
)
}
