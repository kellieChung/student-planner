import { getAllAssignments } from "@/lib/canvas";
import AssignmentCard from "@/components/AssignmentCard";
import WeeklyPlannerView from "@/components/WeeklyPlannerView";
import { Assignment } from "@/types/assignment";

// Temporary test array in app/page.tsx
const mockAssignments = [
  // 1. Overdue / Late Task (Due yesterday)
  {
    id: "test-1",
    name: "Read Chapter 4: Photosynthesis",
    course: "Biology",
    due: "2026-08-06",
  },
  // 2. Due Today (Single-day focal task)
  {
    id: "test-2",
    name: "Submit Lab Safety Quiz",
    course: "Chemistry",
    due: "2026-08-07",
  },
  // 3. Multi-day span (Wed -> Fri)
  {
    id: "test-3",
    name: "Draft Essay: Comparative Literature",
    course: "English",
    due: "2026-08-07",
  },
  // 4. Multi-day span (Mon -> Sat)
  {
    id: "test-4",
    name: "Problem Set #3: Linear Algebra",
    course: "Math",
    due: "2026-08-08",
  },
  // 5. Weekend Task (Due Saturday)
  {
    id: "test-5",
    name: "Group Project Outline",
    course: "History",
    due: "2026-08-08",
  },
  // 6. Full Week Span (Mon -> Sun)
  {
    id: "test-6",
    name: "Final Portfolio Submission",
    course: "Art",
    due: "2026-08-09",
  },
  // 7. Custom Personal Task Example
  {
    id: "custom-test-7",
    name: "Study Session with Alex",
    course: "Personal",
    due: "2026-08-09",
  },
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