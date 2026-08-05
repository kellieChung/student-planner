import { getAllAssignments } from "@/lib/canvas";
import AssignmentCard from "@/components/AssignmentCard";
import WeeklyPlannerView from "@/components/WeeklyPlannerView";
import { Assignment } from "@/types/assignment";

// Temporary test array in app/page.tsx
const mockAssignments = [
  // 1. Mon -> Wed Span (3 Days)
  {
    id: "1",
    name: "The Great Gatsby Reading 1-3",
    course: "English",
    due: "2026-08-05", // Wednesday
    daysRemaining: 0,
  },
  // 2. Mon -> Fri Span (5 Days - Large Bar)
  {
    id: "2",
    name: "Midterm Presentation Prep",
    course: "Physics",
    due: "2026-08-07", // Friday
    daysRemaining: 2,
  },
  // 3. Mon -> Sat Span (6 Days)
  {
    id: "3",
    name: "Vocabulary List & Quiz",
    course: "Math",
    due: "2026-08-08", // Saturday
    daysRemaining: 3,
  },
  // 4. Overlapping Wed -> Thu Task (2 Days)
  {
    id: "4",
    name: "Lab Report: Wave Interference",
    course: "Physics",
    due: "2026-08-06", // Thursday
    daysRemaining: 1,
  },
  // 5. Single Day Task (Due Wednesday)
  {
    id: "5",
    name: "Submit Rough Draft Outline",
    course: "English",
    due: "2026-08-05", // Wednesday
    daysRemaining: 0,
  },
  // 6. Weekend Only Task: Fri -> Sun (3 Days)
  {
    id: "6",
    name: "Problem Set #4: Calculus Integrals",
    course: "Math",
    due: "2026-08-09", // Sunday
    daysRemaining: 4,
  },
  // 7. Full Week Heavyweight Task: Mon -> Sun (7 Days)
  {
    id: "7",
    name: "Final Capstone Research Paper",
    course: "History",
    due: "2026-08-09", // Sunday
    daysRemaining: 4,
  }
];

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

                <WeeklyPlannerView assignments = {mockAssignments} weekStartDate = {monday} />
            </div>
    
        </main>
    );
}