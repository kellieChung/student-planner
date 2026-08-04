import Image from "next/image";
import AssignmentCard from "@/components/AssignmentCard";

export default function Home() {
  const assignments = [
    {
      name: "Physics Lab",
      due: "Tomorrow",
      course: "Physics",
    },
    {
      name: "Essay Draft",
      due: "Friday",
      course: "English",
    },
    {
      name: "Math Homework",
      due: "Monday",
      course: "Calculus",
    },
  ]
  return (
    <main>
      <h1>Student Planner</h1>

      <h2>Upcoming Assignments</h2>

      {assignments.map((assignment) => (
        <AssignmentCard
          key = {assignment.name}
          name = {assignment.name}
          due = {assignment.due}
          course = {assignment.course}
        />
      ))}

    </main>
  );
}
