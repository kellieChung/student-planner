"use client";
import {useState, useEffect} from "react";

type AssignmentCardProps = {
    id: string;
    name: string;
    due: string;
    course: string;
    daysRemaining: number;
};

export default function AssignmentCard({
    id,
    name,
    due,
    course,
    daysRemaining,
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

    const dueDate = new Date(due);

    const urgency = Math.max(0, Math.min(100, 100 - daysRemaining*5));

    return (
        <div className = "bg-slate-900 rounded-xl shadow-md p-5 mb-4">
            <p className = {`${courseColor} rounded-full px-3 py-1 inline-block text-sm text-white`}>
                {course}
            </p>
            <h3 className = "text-xl font-semibold">
                <input
                    type = "checkbox"
                    checked = {completed}
                    onChange = {() => {
                        const newValue = !completed;
                        setCompleted(newValue);
                        localStorage.setItem(id, String(newValue));
                    }}
                />
                
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
    );
}