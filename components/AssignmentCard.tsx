"use client";

type AssignmentCardProps = {
    id: string;
    name: string;
    due: string;
    course: string;
    gridSpan?: string;
    completed: boolean;
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

    if (due) {
        const [year, month, day] = due.split("-").map(Number);
        const dueDate = new Date(year, month - 1, day).setHours(0, 0, 0, 0);
        const today = new Date().setHours(0, 0, 0, 0);
        isLate = dueDate < today && !completed;
    }
    return (
        <div
            style = {{ gridColumn: gridSpan }}
            className = {`group rounded-xl border p-3 shadow-md flex flex-col justify-between transition-all duration-200 overflow-hidden ${completed 
                ? "bg-green-900/40 border-slate-800 text-slate-500 line-through" 
                : "bg-slate-900 border-slate-700/80 hover:border-slate-600 text-white"}`}
            onClick = {onOpen}
        >
            <div className="flex items-start justify-between">

                <div className="flex items-start gap-2.5 min-w-0">

                    <input
                        type="checkbox"
                        checked={completed}
                        onClick = {(e) => e.stopPropagation()}
                        onChange={() => onToggleComplete(id)}
                        className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-0 cursor-pointer"
                    />

                    <div className="min-w-0">

                        <div className="flex gap-2 items-center flex-wrap">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${courseColor}`}>
                                {course}
                            </span>

                            {isLate && (
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-rose-500/20 text-rose-400 border-rose-500/40">
                                    Overdue
                                </span>
                            )}
                        </div>


                        <h3 className="text-xl font-semibold truncate">
                            {name}
                        </h3>


                        <p className="text-gray-400">
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