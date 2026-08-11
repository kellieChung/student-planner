"use client";

type AssignmentCardProps = {
    id: string;
    name: string;
    due: string;
    course: string;
    gridSpan?: string;
    completed: boolean;
    completedAt: string | null;
    onToggleComplete: (id: string) => void;
    onDelete?: (id: string) => void;
    onOpen: () => void;
};

export default function AssignmentCard({
    id,
    name,
    due,
    course,
    gridSpan,
    completed,
    completedAt,
    onToggleComplete,
    onDelete,
    onOpen,
}: AssignmentCardProps) {

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
    let wasCompletedLate = false;

    if (due) {
        const [year, month, day] = due.split("-").map(Number);
        const dueDate = new Date(year, month - 1, day).setHours(0, 0, 0, 0);
        const today = new Date().setHours(0, 0, 0, 0);
        isLate = dueDate < today && !completed;

        if (completed && completedAt) {
            const [completedYear, completedMonth, completedDay] = completedAt.split("-").map(Number);
            const completedDate = new Date(completedYear, completedMonth - 1, completedDay).setHours(0, 0, 0, 0);
            wasCompletedLate = completedDate > dueDate;
        }
    }
    return (
        <div
            style = {{ gridColumn: gridSpan }}
            className = {`group rounded-lg border p-2 shadow-sm flex flex-col justify-between transition-all duration-200 overflow-hidden ${wasCompletedLate
                ? "bg-slate-900 border-rose-900/80 text-rose-100 hover:border-rose-800"
                : completed
                    ? "bg-green-900/40 border-slate-800 text-slate-500"
                : isLate
                    ? "bg-rose-950/80 border-rose-500/70 text-rose-50 hover:border-rose-400"
                : "bg-slate-900 border-slate-700/80 hover:border-slate-600 text-white"}`}
            onClick = {onOpen}
        >
            <div className="flex items-start justify-between">

                <div className="flex items-start gap-2 min-w-0">

                    <input
                        type="checkbox"
                        checked={completed}
                        onClick = {(e) => e.stopPropagation()}
                        onChange={() => onToggleComplete(id)}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-0 cursor-pointer"
                    />

                    <div className="min-w-0">

                        <div className="flex gap-1.5 items-center flex-wrap">
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${courseColor}`}>
                                {course}
                            </span>

                            {wasCompletedLate && (
                                <span className="no-underline text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-rose-800 bg-rose-950/40 text-rose-200">
                                    ✓ Completed late
                                </span>
                            )}

                        </div>


                        <h3 className={`text-sm font-semibold leading-snug truncate ${completed ? "line-through" : ""}`}>
                            {name}
                        </h3>


                        <p className={`text-xs ${isLate || wasCompletedLate ? "text-rose-200" : "text-gray-400"}`}>
                            Due: {due}
                        </p>

                    </div>

                </div>


                {onDelete && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-rose-400 text-xs px-1.5 py-0.5 rounded shrink-0"
                        title="Delete Task"
                    >
                        ✕
                    </button>
                )}

            </div>
    </div>
            
    );
}
