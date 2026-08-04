import Image from "next/image";
import AssignmentCard from "@/components/AssignmentCard";

export default function Home() {
  return (
    <main>
      <h1>Student Planner</h1>

      <h2>Upcoming Assignments</h2>

      <AssignmentCard
        name="Physics Lab"
        due="Tomorrow"
        course="Physics"
      />

      <AssignmentCard
        name="Essay Draft"
        due="Friday"
        course="English"
      />

      <AssignmentCard
        name="Math Homework"
        due="Monday"
        course="Calculus"
      />

    </main>
  );
}
