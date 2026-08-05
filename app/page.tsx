import { getAllAssignments } from "@/lib/canvas";
import AssignmentCard from "@/components/AssignmentCard";
import { Assignment } from "@/types/assignment";

export default async function TestPage() {

    const assignments: Assignment[] = await getAllAssignments();

    const groupedByDate = assignments.reduce<Record<string, Assignment[]>>((acc, assignment) => {
        const formattedDate = assignment.due
            ? new Date(assignment.due).toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
            })
            : "No due date";
        
            if (!acc[formattedDate]) {
                acc[formattedDate] = [];
            }

            acc[formattedDate].push(assignment);
            return acc;
    }, {});

    const dateHeaders = Object.keys(groupedByDate);

    return (
        <main className = "min-h-screen bg-slate-950 p-8">
            <h1 className = "text-4xl font-bold mb-8 text-blue-400">
            Student Planner
            </h1>
    
            <h2 className = "text-2xl font-semibold mb-4">
            Upcoming Assignments
            </h2>
            
            <div className = "space-y-8">
                {dateHeaders.map((dateString) => (
                    <section key = {dateString} className = "bg-slate-900/50 p-4 rounded 2-xl border border-slate-800">
                        <h3 className = "text-lg font-bold text-indigo-400 mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
                            {dateString}
                        </h3>
                        <div className = "space-y-4">
                            {groupedByDate[dateString].map((assignment) => (
                                <AssignmentCard
                                    key = {assignment.id}
                                    id = {assignment.id}
                                    name = {assignment.name}
                                    due = {assignment.due ? new Date(assignment.due).toLocaleDateString() : "No due date"}
                                    course = {assignment.course}
                                    daysRemaining = {assignment.daysRemaining}
                                />
                            ))}
                        </div>
                    </section>
                ))}
            </div>
    
        </main>
    );
}