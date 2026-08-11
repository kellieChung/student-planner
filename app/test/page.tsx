import { getAllAssignments } from "@/lib/canvas";
import AssignmentCard from "@/components/AssignmentCard";
import WeeklyPlannerView from "@/components/WeeklyPlannerView";
import { Assignment } from "@/types/assignment";

// Temporary test array in app/page.tsx
const mockAssignments = [
  // --- MONDAY (Aug 10) ---
  {
    id: "test-101",
    name: "Read Chapter 1: Foundations of Data Structures",
    course: "Computer Science",
    due: "2026-08-10",
  },
  {
    id: "test-102",
    name: "Syllabus Quiz & Academic Integrity Form",
    course: "Math",
    due: "2026-08-10",
  },
  {
    id: "test-103",
    name: "Discussion Board Intro: Favorite Authors",
    course: "English",
    due: "2026-08-10",
  },

  // --- TUESDAY (Aug 11 - TODAY) ---
  {
    id: "test-104",
    name: "Lab Safety & Equipment Quiz",
    course: "Physics",
    due: "2026-08-11",
  },
  {
    id: "test-105",
    name: "Problem Set #1: Linear Equations",
    course: "Math",
    due: "2026-08-11",
  },
  {
    id: "test-106",
    name: "Spanish Vocabulary Flashcards Set 1",
    course: "Spanish",
    due: "2026-08-11",
  },

  // --- WEDNESDAY (Aug 12) ---
  {
    id: "test-107",
    name: "Annotated Bibliography Draft",
    course: "English",
    due: "2026-08-12",
  },
  {
    id: "test-108",
    name: "Python Basics Worksheets 1 & 2",
    course: "Computer Science",
    due: "2026-08-12",
  },
  {
    id: "test-109",
    name: "Primary Source Analysis: Revolutionary War",
    course: "History",
    due: "2026-08-12",
  },

  // --- THURSDAY (Aug 13) ---
  {
    id: "test-110",
    name: "Kinematics Numerical Exercises",
    course: "Physics",
    due: "2026-08-13",
  },
  {
    id: "test-111",
    name: "Spanish Listening Comprehension Module",
    course: "Spanish",
    due: "2026-08-13",
  },
  {
    id: "test-112",
    name: "Group Project: Topic Selection",
    course: "History",
    due: "2026-08-13",
  },

  // --- FRIDAY (Aug 14) ---
  {
    id: "test-113",
    name: "Weekly Essay: Modern Prose Critique",
    course: "English",
    due: "2026-08-14",
  },
  {
    id: "test-114",
    name: "Calculus Quiz 1",
    course: "Math",
    due: "2026-08-14",
  },
  {
    id: "test-115",
    name: "Physics Lab Report #1 - Freefall Motion",
    course: "Physics",
    due: "2026-08-14",
  },

  // --- SATURDAY (Aug 15) ---
  {
    id: "test-116",
    name: "Peer Review Assignment #1",
    course: "English",
    due: "2026-08-15",
  },
  {
    id: "test-117",
    name: "Study Group Prep: CS Algorithm Review",
    course: "Personal",
    due: "2026-08-15",
  },

  // --- SUNDAY (Aug 16) ---
  {
    id: "test-118",
    name: "Weekly Summary Video Quiz",
    course: "Spanish",
    due: "2026-08-16",
  },
  {
    id: "test-119",
    name: "Weekly Coding Challenge: Array Operations",
    course: "Computer Science",
    due: "2026-08-16",
  },
  {
    id: "test-120",
    name: "Plan Schedule for Next Week",
    course: "Personal",
    due: "2026-08-16",
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