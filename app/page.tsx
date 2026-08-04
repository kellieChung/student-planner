import Image from "next/image";
import AssignmentCard from "@/components/AssignmentCard";

export default function Home() {
  const assignments = [
    {
      id: "physics-lab-1",
      name: "Physics Lab",
      due: "Tomorrow",
      course: "Physics",
    },
    {
      id: "english-essay-1",
      name: "Essay Draft",
      due: "Friday",
      course: "English",
    },
    {
      id: "math-homework-1",
      name: "Math Homework",
      due: "Monday",
      course: "Math",
    },
  ]
  return (
    <main className = "min-h-screen bg-slate-950 p-8">
      <h1 className = "text-4xl font-bold mb-8 text-blue-400">
        Student Planner
      </h1>

      <h2 className = "text-2xl font-semibold mb-4">
        Upcoming Assignments
      </h2>
      
      <div className = "grid gap-4 md:grid-cols-2">
        {assignments.map((assignment) => (
          <AssignmentCard
            key = {assignment.id}
            id = {assignment.id}
            name = {assignment.name}
            due = {assignment.due}
            course = {assignment.course}
          />
        ))}
      </div>

    </main>
  );
}
