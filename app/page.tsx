import { getAllAssignments } from "@/lib/canvas";
import AssignmentCard from "@/components/AssignmentCard";
import WeeklyPlannerView from "@/components/WeeklyPlannerView";
import { Assignment } from "@/types/assignment";

export default async function TestPage() {

    const assignments: Assignment[] = (await getAllAssignments()).map((assignment) => ({
        ...assignment,
        due: assignment.due ?? "",
    }));

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

    const today = new Date();
    const dayOfWeek = today.getDay();
    const distanceToMonday = (dayOfWeek + 6) % 7; 
    const monday = new Date(today);
    monday.setDate(today.getDate() - distanceToMonday);

    const dateHeaders = Object.keys(groupedByDate);

    return (
        <main className = "min-h-screen bg-slate-950 p-8">
            <div className = "w-full px-4 mx-auto">
                <h1 className = "text-3xl font-bold mb-2 text-indigo-400">ATLAS Planner</h1>
                <p className = "text-slate-400 mb-8"> Weekly Calendar Overview </p>

                <WeeklyPlannerView assignments = {assignments} weekStartDate = {monday} />
            </div>
    
        </main>
    );
}