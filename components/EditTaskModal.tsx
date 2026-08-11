"use client";

import React, {useState, useEffect} from "react";
import {Assignment} from "@/types/assignment";

type EditTaskModalProps = {
    task: Assignment | null;
    isOpen: boolean;
    onClose: () => void;
    onSaveTask: (updatedTask: Assignment) => void;
    onDeleteTask: (id:string) => void;
};

export default function EditTaskModal({
    task,
    isOpen,
    onClose,
    onSaveTask,
    onDeleteTask,
}: EditTaskModalProps) {
    const [name, setName] = useState("");
    const [course, setCourse] = useState("");
    const [due, setDue] = useState("");

    useEffect(() => {
        if (task) {
            setName(task.name || "");
            setCourse(task.course || "");
            setDue(task.due || "");
        }
    }, [task]);

    if (!isOpen ||!task) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(!name) return;

        onSaveTask({
            ...task,
            name,
            course,
            due,
        });

        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl text-white">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300">
                        {course || "General"}
                        </span>
                        <h2 className="text-lg font-bold text-slate-100 mt-2 leading-snug">
                        Edit Task Details
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

                <form onSubmit = {handleSubmit} className = "flex flex-col gap-4">
                    <div>
                        <label className = "block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                            Full Task Name
                        </label>
                        <textarea
                            rows = {3}
                            required
                            value = {name}
                            onChange = {(e) => setName(e.target.value)}
                            className = "w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus: outline-none focus: border-indigo-500 resize-none"
                        />
                    </div>
                <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                Course / Category
              </label>
              <input
                type="text"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                Due Date
              </label>
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 color-scheme-dark"
              />
            </div>
          </div>
          
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                onDeleteTask(task.id);
                onClose();
              }}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/50 transition-all"
            >
              Delete Task
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-950"
              >
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
