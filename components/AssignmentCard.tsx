"use client";
import {useState, useEffect} from "react";

type AssignmentCardProps = {
    id: string;
    name: string;
    due: string;
    course: string;
    daysRemaining: number;
    gridSpan?: string;
};

export default function AssignmentCard({
    id,
    name,
    due,
    course,
    daysRemaining,
    gridSpan,
}: AssignmentCardProps) {

    const [completed, setCompleted] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem(id);

        if (saved === "true") {
            setCompleted(true);
        }
    }, [id]);

    let courseColor = "bg-gray-700";

    if (course === "Physics") {
        courseColor = "bg-blue-700";
    }

    if (course === "English") {
        courseColor = "bg-yellow-700";
    }

    if (course === "Math") {
        courseColor = "bg-red-700";
    }

    let isLate = false;

    if (due) {
        const [year, month, day] = due.split("-").map(Number);
        const dueDate = new Date(year, month - 1, day).setHours(0, 0, 0, 0);
        const today = new Date().setHours(0, 0, 0, 0);
        isLate = dueDate < today && !completed;
    }

    const urgency = Math.max(0, Math.min(100, 100 - daysRemaining*5));

    return (
        <div
            style = {{ gridColumn: gridSpan }}
            className = {`rounded-xl border p-3 shadow-md flex flex-col justify-between transition-all duration-200 overflow-hidden ${completed 
                ? "bg-green-900/40 border-slate-800 text-slate-500 line-through" 
                : "bg-slate-900 border-slate-700/80 hover:border-slate-600 text-white"}`}
        >
            <div className = "flex items-start gap-2.5 overflow-hidden">
                <input
                    type = "checkbox"
                    checked = {completed}
                    onChange = {() => {
                        const newValue = !completed;
                        setCompleted(newValue);
                        localStorage.setItem(id, String(newValue));
                    }}
                    className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-0 cursor-pointer"
                />
                <div className = "overflow-hidden truncate">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border inline-block mb-1 ${courseColor}`}>
                    {course}
                </span>
                {isLate && (
                    <span className = "text-9px[ font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-rose-500/20 text-rose-400 border-rose-500/40">
                        Overdue
                    </span>
                )}
                <h3 className = "text-xl font-semibold">
                    {name}
                </h3>
                <p className = "text-gray-400">
                    Due: {due} ({daysRemaining} days remaining)
                </p>

                <div className = "w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                    <div className = "h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-300"
                        style = {{
                            width: `${urgency}%`
                        }}
                    >
                    </div>
                </div>
            </div>
        </div>
    </div>
            
    );
}